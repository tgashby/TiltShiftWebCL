/*

*/

var nodejs = (typeof window === 'undefined');
if (nodejs) {
    WebCL = require('/Users/tgashby/node_modules/node-webcl/webcl');
    Image = require('node-image').Image;
};

if (WebCL === undefined) {
    alert("Aww crap. No WebCL.");
}

function AlphaizeImage (imageName) {
    // load image
    var file = imageName;
    console.log('Loading image '+file);
    var img = Image.load(file);
    if (!img)
        console.log("Error loading image")

    var image = img.convertTo32Bits();
    var szBuffBytes = image.height*image.pitch;
    var outputBytes = new Uint8Array(szBuffBytes);
    var outputImageBuffer;
    var inputImage;

    // CL Platform setup
    var platformList = WebCL.getPlatforms();
    var platform = platformList[0];
    console.log("Using Platform: " + platform.getInfo(WebCL.PLATFORM_NAME));

    var devices = platform.getDevices(WebCL.DEVICE_TYPE_DEFAULT);
    var device = devices[0]
    console.log("Using Card: " + device.getInfo(WebCL.DEVICE_NAME));

    var hasImageSupport = device.getInfo(WebCL.DEVICE_IMAGE_SUPPORT);
    if(hasImageSupport != WebCL.TRUE) {
      log("No image support");
      return;
    }

    var clContext = WebCL.createContext({
        devices: device,
        platform: platform
    });

    queue = clContext.createCommandQueue(device, 0);

    // Allocate OpenCL object for the source data
    var InputFormat = {
      order : WebCL.RGBA,
      data_type : WebCL.UNSIGNED_INT8,
      size : [ image.width, image.height ],
      rowPitch : image.pitch
    };

    inputImage = clContext.createImage(WebCL.MEM_READ_ONLY | WebCL.MEM_USE_HOST_PTR, InputFormat, image.buffer);
    outputImageBuffer = clContext.createBuffer(WebCL.MEM_WRITE_ONLY, szBuffBytes);

    // var RowSampler = clContext.createSampler(false, WebCL.ADDRESS_CLAMP, WebCL.FILTER_NEAREST);

    clProgram = clContext.createProgram("see_through.cl");

    clProgram.build(device, "-cl-fast-relaxed-math");

    var clKernel = clProgram.createKernel("Alphaize");

    clKernel.setArg(0, inputImage);
    clKernel.setArg(1, outputImageBuffer);
    // clKernel.setArg(2, RowSampler);

    // RUN YO SHIT
    // HERE
    queue.enqueueWriteImage(inputImage, WebCL.TRUE, [0, 0, 0], [image.width, image.height, 1], 0, 0, image.buffer);

    queue.finish();

    // enqueueNDRangeKernel(WebCLKernel kernel, CLuint[3]? globalWorkOffset, CLuint[3]? globalWorkSize, CLuint[3]? localWorkSize)
    queue.enqueueNDRangeKernel(clKernel, null, [image.height, 1], [1, 1]);

    queue.finish();

    // Using buffer instead
    queue.enqueueReadBuffer(outputImageBuffer, WebCL.TRUE, 0, szBuffBytes, outputBytes);

    // Write out the image
    if(!Image.save('out_test.png', outputBytes, image.width, image.height, image.pitch, image.bpp, 0xFF0000, 0x00FF00, 0xFF))
        console.log("Error saving image");
}


AlphaizeImage("old_test.png");