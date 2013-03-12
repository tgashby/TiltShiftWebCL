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

// nodejs, node-image, node-webcl required
var nodejs = (typeof window === 'undefined');
if (nodejs) {
    WebCL = require('/Users/tgashby/node_modules/node-webcl/webcl');
    Image = require('node-image').Image;
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
    // queues, etc). It is the meaty mc-meaterson for doing most things.
    clContext = WebCL.createContext({
        devices: device,
        platform: platform
    });

    // CL Queue setup
    // The Queue is, as the name implies, where we will be queueing kernels to
    // execute on our device.
    clQueue = clContext.createCommandQueue(device, 0);
}

function AlphaizeImage (imageName) {
    // load image
    var file = imageName;
    console.log('Loading image ' + file);

    var img = Image.load(file);
    if (!img)
        throw "Error loading image";

    var image = img.convertTo32Bits();
    var szBuffBytes = image.height*image.pitch;
    var outputBytes = new Uint8Array(szBuffBytes);
    var outputImageBuffer;
    var inputImage;

    InitWebCL();

    // Allocate OpenCL object for the image source data
    var InputFormat = {
      order : WebCL.RGBA,
      data_type : WebCL.UNSIGNED_INT8,
      size : [image.width, image.height],
      rowPitch : image.pitch
    };

    // Create an Image buffer (as opposed to a plain old data buffer)
    // createImage (memory_flags, imageFormat, imageBuffer)
    // memory_flags options:
    // MEM_READ_WRITE
    // MEM_WRITE_ONLY
    // MEM_READ_ONLY
    // MEM_USE_HOST_PTR     - Use host pointer, don't create anything new
    // MEM_ALLOC_HOST_PTR   - Allocate a new host pointer,
    // MEM_COPY_HOST_PTR    - Copy the host pointer
    // imageBuffer acts as the host pointer here.
    inputImage = clContext.createImage(WebCL.MEM_READ_ONLY | WebCL.MEM_USE_HOST_PTR, InputFormat, image.buffer);

    // Create a normal buffer to hold the outgoing pixels
    // createBuffer (memory_flags, size, optional host_ptr)
    outputImageBuffer = clContext.createBuffer(WebCL.MEM_WRITE_ONLY, szBuffBytes);

    // Create our Program
    // Programs are a set of kernels, basically it's a representation of the
    // OpenCL file(s) with all the functions in it.
    var clProgram = clContext.createProgram("see_through.cl");

    // Compile the program!
    // build (device, optional flags, optional data, optional callback)
    clProgram.build(device, "-cl-fast-relaxed-math");

    // Get our Kernel(s) set up.
    // Kernels are the actual functions that will be run on the device
    // You can choose any of the kernels specificed in the Program
    var clKernel = clProgram.createKernel("Alphaize");

    // Set up our Kernel arguments
    // Kernel arguments are numbered in array-fashion
    clKernel.setArg(0, inputImage);
    clKernel.setArg(1, outputImageBuffer);

    // Write our image into OpenCL memory space!
    // enqueueWriteImage(cl_image, blocking_write, origin, region, row_pitch,
    //  slice_pitch, ptr, optional event_list, optional event)
    clQueue.enqueueWriteImage(inputImage, WebCL.TRUE, [0, 0, 0], [image.width, image.height, 1], 0, 0, image.buffer);

    // Finish all tasks in the queue before continuing.
    // (The image has to be written before it can be read)
    clQueue.finish();

    // Yay, all the setup is done, let's do some work!
    // Run our kernel
    // enqueueNDRangeKernel (kernel, offsets, global_workgroup, local_workgroup, optional event_list, optional event)
    // Workgroups:
    // Global - Total number of elements (indices) in the domain
    // Local - Subgroups for inter-item communication (out of our scope)
    clQueue.enqueueNDRangeKernel(clKernel, null, [image.height, 1], [1, 1]);

    clQueue.finish();

    // Read our pixel back out from OpenCL memory space
    clQueue.enqueueReadBuffer(outputImageBuffer, WebCL.TRUE, 0, szBuffBytes, outputBytes);

    // Write out the image
    if(!Image.save('out_test.png', outputBytes, image.width, image.height, image.pitch, image.bpp, 0xFF0000, 0x00FF00, 0xFF))
        console.log("Error saving image");
}


AlphaizeImage("old_test.png");