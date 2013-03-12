unsigned int PixelToBufferData(uint4 pixel);
uint4 BufferDataToPixel(unsigned int pixelValue);
unsigned int lerp(unsigned int initialYPos, unsigned int finalYPos, float dist);

// Used to pack the pixel into the output array
unsigned int PixelToBufferData(uint4 pixel)
{
    unsigned int uiPackedPix = 0U;
    uiPackedPix |= 0x000000FF & pixel.x;
    uiPackedPix |= 0x0000FF00 & (pixel.y << 8);
    uiPackedPix |= 0x00FF0000 & (pixel.z << 16);
    uiPackedPix |= 0xFF000000 & (pixel.w << 24);

    return uiPackedPix;
}

// Unpack the buffer data into a pixel
uint4 BufferDataToPixel(unsigned int pixelValue)
{
    unsigned int pixelMask = 0x000000FF;
    unsigned int redValue = pixelValue & pixelMask;
    unsigned int greenValue = (pixelValue >> 8) & pixelMask;
    unsigned int blueValue = (pixelValue >> 16) & pixelMask;
    unsigned int alphaValue = (pixelValue >> 24) & pixelMask;
    uint4 pixel = {redValue, greenValue, blueValue, alphaValue};

    return pixel;
}

unsigned int lerp(unsigned int initialYPos, unsigned int finalYPos, float dist)
{
    return (unsigned int)(initialYPos + (finalYPos - initialYPos) * dist);
}

__kernel void BoxBlur(__read_only image2d_t sourceImg, __global unsigned int* outputImg)
{

}

__kernel void BoxFilter(__read_only image2d_t originalImg, __global unsigned int* blurredImg,
    __global unsigned int* outputImage)
{

}


// Reference

// Take the alpha value of each pixel and cut it in half.
// Each worker will handle 1 row of the image.
// __kernel void Alphaize( __read_only image2d_t sourceImg, __global unsigned int* outputBuffer)
// {
//     int imgWidth = get_image_width(sourceImg);
//     int imgHeight = get_image_height(sourceImg);
//     sampler_t sampler = CLK_NORMALIZED_COORDS_FALSE | CLK_ADDRESS_CLAMP | CLK_FILTER_NEAREST;
//
//
//     int row = get_global_id(0);
//
//     int rowOffset = mul24(row, imgWidth);
//
//     if (row < imgHeight)
//     {
//         for (int col = 0; col < imgWidth; col++)
//         {
//             int2 pixelPos = {col, row};
//             uint4 rgbaVals = read_imageui(sourceImg, sampler, pixelPos);
//             uint4 newRgba = {rgbaVals.x, rgbaVals.y, rgbaVals.z, rgbaVals.w / 2};
//
//             outputBuffer[rowOffset + col] = PixelToBufferData(newRgba);
//         }
//     }
// }