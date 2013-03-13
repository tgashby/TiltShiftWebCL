/*
CSC 520 Final Project
Box Filter using WebCL
*/

// Globals (yes this is overkill, I don't care)
var WebCL;
var Image;
var platform;
var device;
var clContext;
var clQueue;


// Box processing params
var iRadius = 14;                  // initial radius of 2D box filter mask
var fScale = 1/(2 * iRadius + 1);  // precalculated GV rescaling value

var ckBoxRowsTex;             // OpenCL Kernel for row sum (using 2d Image/texture)
var ckBoxColumns;             // OpenCL for column sum and normalize
var clInputImage;               // OpenCL device memory object (buffer or 2d Image) for input data
var cmDevBufTemp;             // OpenCL device memory temp buffer object
var cmDevBufOut;              // OpenCL device memory output buffer object
var szBuffBytes;              // Size of main image buffers
var szGlobalWorkSize=[0,0];      // global # of work items
var szLocalWorkSize= [0,0];       // work group # of work items
var szMaxWorkgroupSize = 512; // initial max # of work items

var clBlurImageBuffer;
var szBuffBytes;
var image;

// nodejs, node-image, node-webcl required
var nodejs = (typeof window === 'undefined');
if (nodejs) {
    WebCL = require('node-webcl');
    Image = require('node-image').Image;
    clu = require('./clUtils');
    util = require('util');
    fs = require('fs');
    log = console.log;
};

if (WebCL === undefined) {
    throw "Aww crap. No WebCL.";
}

function InitWebCL () {
    // CL Platform setup
    // Platforms are "The host plus a collection of devices managed by the
    // OpenCL framework that allow an application to share resources and
    // execute kernels on devices in the platform."
    // Basically I have no idea but they seem to be an intermediate step to
    // Devices which are the important things
    var platformList = WebCL.getPlatforms();

    platform = platformList[0];
    console.log("Using Platform: " + platform.getInfo(WebCL.PLATFORM_NAME));

    // CL Device setup
    // Devices are what actaully do the work, CPUs, GPUs, etc
    var devices = platform.getDevices(WebCL.DEVICE_TYPE_DEFAULT);

    // This appears to always be the graphics card... But I'm taking it on faith.
    device = devices[0];
    console.log("Using Card: " + device.getInfo(WebCL.DEVICE_NAME));

    // We want to manipulate images, we better have image support.
    var hasImageSupport = device.getInfo(WebCL.DEVICE_IMAGE_SUPPORT);
    if(hasImageSupport != WebCL.TRUE) {
      throw "No image support";
    }

    // CL Context setup
    // Context is the entire OpenCL environment (kernels, devices, memory management,
    // clQueues, etc). It is the meaty mc-meaterson for doing most things.
    clContext = WebCL.createContext({
        devices: device,
        platform: platform
    });

    // CL Queue setup
    // The Queue is, as the name implies, where we will be clQueueing kernels to
    // execute on our device.
    clQueue = clContext.createCommandQueue(device, 0);
}

// Total theft

function InitTiltShiftSystem (imageFile)
{
    // Load original image
    var file = imageFile;
    console.log('Loading image ' + file);

    var img = Image.load(file);
    if (!img)
        throw "Error loading image";

    // Convert the image to make life easy and breezy
    image = img.convertTo32Bits();

    // Create blurred image

    szBuffBytes = image.height*image.pitch;

    // Allocate OpenCL object for the image source data
    var InputFormat = {
      order : WebCL.RGBA,
      data_type : WebCL.UNSIGNED_INT8,
      size : [image.width, image.height],
      rowPitch : image.pitch
    };

    //2D Image (Texture) on device
    clInputImage = clContext.createImage(WebCL.MEM_READ_ONLY | WebCL.MEM_USE_HOST_PTR, InputFormat, image.buffer);

    RowSampler = clContext.createSampler(false, WebCL.ADDRESS_CLAMP, WebCL.FILTER_NEAREST);

    // Allocate the OpenCL intermediate and result buffer memory objects on the device GMEM
    cmDevBufTemp = clContext.createBuffer(WebCL.MEM_READ_WRITE, szBuffBytes);
    cmDevBufOut = clContext.createBuffer(WebCL.MEM_WRITE_ONLY, szBuffBytes);

    //Create the program
    clProgram = clContext.createProgram("tilt_shift.cl");

    sBuildOpts = "-cl-fast-relaxed-math";
    ciErrNum = clProgram.build(device, sBuildOpts);

    ckBoxRowsTex = clProgram.createKernel("BoxRowsTex");
    ckBoxColumns = clProgram.createKernel("BoxColumns");

    // set the kernel args
    ResetKernelArgs(image.width, image.height, iRadius, fScale);

    // launch processing on the GPU
    BoxFilterGPU (image, cmDevBufOut, iRadius, fScale);
    clQueue.finish();

    // Copy results back to host memory, block until complete
    clBlurImageBuffer=new Uint8Array(szBuffBytes);
    clQueue.enqueueReadBuffer(cmDevBufOut, WebCL.TRUE, 0, szBuffBytes, clBlurImageBuffer);

    clQueue.finish();

    // PNG uses 32-bit images, JPG can only work on 24-bit images
    if(!Image.save('out_'+iRadius+'.png',clBlurImageBuffer, image.width,image.height, image.pitch, image.bpp, 0xFF0000, 0x00FF00, 0xFF))
      log("Error saving image");
}

function ResetKernelArgs(width, height, r, fScale)
{
    // (Image/texture version)
    ckBoxRowsTex.setArg(0, clInputImage);
    ckBoxRowsTex.setArg(1, cmDevBufTemp);
    ckBoxRowsTex.setArg(2, RowSampler);
    ckBoxRowsTex.setArg(3, width, WebCL.type.UINT);
    ckBoxRowsTex.setArg(4, height, WebCL.type.UINT);
    ckBoxRowsTex.setArg(5, r, WebCL.type.INT);
    ckBoxRowsTex.setArg(6, fScale, WebCL.type.FLOAT);

    // Set the Argument values for the column kernel
    ckBoxColumns.setArg(0, cmDevBufTemp);
    ckBoxColumns.setArg(1, cmDevBufOut);
    ckBoxColumns.setArg(2, width, WebCL.type.UINT);
    ckBoxColumns.setArg(3, height, WebCL.type.UINT);
    ckBoxColumns.setArg(4, r, WebCL.type.INT);
    ckBoxColumns.setArg(5, fScale, WebCL.type.FLOAT);
}

//OpenCL computation function for GPU:
//Copies input data to the device, runs kernel, copies output data back to host
//*****************************************************************************
function BoxFilterGPU(image, cmOutputBuffer, r, fScale)
{
    // Setup Kernel Args
    ckBoxColumns.setArg(1, cmOutputBuffer);

    // Copy input data from host to device
    var szTexOrigin = [0, 0, 0];                // Offset of input texture origin relative to host image
    var szTexRegion = [image.width, image.height, 1];   // Size of texture region to operate on
    log('enqueue image: origin='+szTexOrigin+", region="+szTexRegion);
    clQueue.enqueueWriteImage(clInputImage, WebCL.TRUE, szTexOrigin, szTexRegion, 0, 0, image.buffer);

    // Set global and local work sizes for row kernel
    szLocalWorkSize[0] = 1;
    szLocalWorkSize[1] = 1;
    szGlobalWorkSize[0]= szLocalWorkSize[0] * clu.DivUp(image.height, szLocalWorkSize[0]);
    szGlobalWorkSize[1] = 1;
    log("row kernel work sizes: global="+szGlobalWorkSize+" local="+szLocalWorkSize);

    //Sync host
    clQueue.finish();

    //Launch row kernel
    clQueue.enqueueNDRangeKernel(ckBoxRowsTex, null, szGlobalWorkSize, szLocalWorkSize);

    //Set global and local work sizes for column kernel
    szLocalWorkSize[0] = 1;
    szLocalWorkSize[1] = 1;
    szGlobalWorkSize[0] = szLocalWorkSize[0] * clu.DivUp(image.width, szLocalWorkSize[0]);
    szGlobalWorkSize[1] = 1;
    log("column kernel work sizes: global="+szGlobalWorkSize+" local="+szLocalWorkSize);

    //Launch column kernel
    clQueue.enqueueNDRangeKernel(ckBoxColumns, null, szGlobalWorkSize, szLocalWorkSize);

    //sync host
    clQueue.finish();
}

// End total theft

function TiltShift (lowerBoundary, upperBoundary) {
    // Compute composite image
    var outputBytes = new Uint8Array(szBuffBytes);
    var outputImageBuffer;

    // Display image

    // Create a normal buffer to hold the outgoing pixels
    // createBuffer (memory_flags, size, optional host_ptr)
    outputImageBuffer = clContext.createBuffer(WebCL.MEM_WRITE_ONLY, szBuffBytes);

    // Get our Kernel(s) set up.
    // Kernels are the actual functions that will be run on the device
    // You can choose any of the kernels specificed in the Program
    var tiltShiftKernel = clProgram.createKernel("TiltShift");

    // Set up our Kernel arguments
    // Kernel arguments are numbered in array-fashion
    tiltShiftKernel.setArg(0, clInputImage);
    tiltShiftKernel.setArg(1, cmDevBufOut);
    tiltShiftKernel.setArg(2, outputImageBuffer);
    tiltShiftKernel.setArg(3, lowerBoundary, WebCL.type.UINT);
    tiltShiftKernel.setArg(4, upperBoundary, WebCL.type.UINT);

    // Yay, all the setup is done, let's do some work!
    // Run our kernel
    // enqueueNDRangeKernel (kernel, offsets, global_workgroup, local_workgroup, optional event_list, optional event)
    // Workgroups:
    // Global - Total number of elements (indices) in the domain
    // Local - Subgroups for inter-item communication (out of our scope)
    clQueue.enqueueNDRangeKernel(tiltShiftKernel, null, [image.height, 1], [1, 1]);

    clQueue.finish();

    // Read our pixel back out from OpenCL memory space
    clQueue.enqueueReadBuffer(outputImageBuffer, WebCL.TRUE, 0, szBuffBytes, outputBytes);

    // Write out the image
    if(!Image.save('out_test.png', outputBytes, image.width, image.height, image.pitch, image.bpp, 0xFF0000, 0x00FF00, 0xFF))
        console.log("Error saving image");
}

InitWebCL();
InitTiltShiftSystem("Central_Cape_Town.png");

// Get slider values to pass in!
TiltShift(30, 100);