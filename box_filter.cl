unsigned int rgbaUint4ToUint(uint4 rgba);

// Used to pack the pixels into the output array
// For some reason the expected pixel packing (found through testing) is
// 0x A R G B, rather than 0x A B G R as expected...
unsigned int rgbaUint4ToUint(uint4 rgba) {
  unsigned int uiPackedPix = 0U;
  uiPackedPix |= 0x000000FF & rgba.x;
  uiPackedPix |= 0x0000FF00 & (rgba.y << 8);
  uiPackedPix |= 0x00FF0000 & (rgba.z << 16);
  uiPackedPix |= 0xFF000000 & (rgba.w << 24);
  return uiPackedPix;
}

// Take the alpha value of each pixel and cut it in half.
// Each worker will handle 1 row of the image.
__kernel void Alphaize( __read_only image2d_t sourceImg, __global unsigned int* outputBuffer)
{
    int imgWidth = get_image_width(sourceImg);
    int imgHeight = get_image_height(sourceImg);
    sampler_t sampler = CLK_NORMALIZED_COORDS_FALSE | CLK_ADDRESS_CLAMP | CLK_FILTER_NEAREST;


    int row = get_global_id(0);

    int rowOffset = mul24(row, imgWidth);

    if (row < imgHeight)
    {
        for (int col = 0; col < imgWidth; col++)
        {
            int2 pixelPos = {col, row};
            uint4 rgbaVals = read_imageui(sourceImg, sampler, pixelPos);
            uint4 newRgba = {rgbaVals.x, rgbaVals.y, rgbaVals.z, rgbaVals.w / 2};

            outputBuffer[rowOffset + col] = rgbaUint4ToUint(newRgba);
        }
    }
}