unsigned int PixelToBufferData(uint4 pixel);
uint4 BufferDataToPixel(unsigned int pixelValue);
float CalculateUpperBlurPercent(unsigned int row, unsigned int boundary);
float CalculateLowerBlurPercent(unsigned int row, unsigned int boundary, unsigned int imageHeight);
uint4 ComposePixels(uint4 clearPixel, uint4 blurPixel, float clearPercent, float blurPercent);

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

float CalculateUpperBlurPercent(unsigned int row, unsigned int boundary)
{
    float blurPercent = 1.0f - ((float)row) / boundary;

    return blurPercent;
}

float CalculateLowerBlurPercent(unsigned int row, unsigned int boundary, unsigned int imageHeight)
{
    float blurPercent = 1.0f - (((float)imageHeight) - row)/(imageHeight - boundary);

    return blurPercent;
}

uint4 ComposePixels(uint4 clearPixel, uint4 blurPixel, float clearPercent, float blurPercent)
{
    uint4 newPixel = {clearPixel.x * clearPercent + blurPixel.x * blurPercent, 
                      clearPixel.y * clearPercent + blurPixel.y * blurPercent,
                      clearPixel.z * clearPercent + blurPixel.z * blurPercent, 
                      clearPixel.w * clearPercent + blurPixel.w * blurPercent};

    return newPixel;
}

/*
    Take in the original image and blurred image and add them together
    - Linear gradient of blur

    *************************************
    *                                   *   - 100% blur
    *   Blurred                         *   - 50% blur
    *___________________________________*   - upperBoundary, 0% blur
    *                                   *
    *                                   *
    *   Clear                           *
    *                                   *
    *___________________________________*   - lowerBoundary, 0% blur
    *                                   *   - 50% blur
    *   Blurred                         *   - 100% blur
    *************************************   

*/
__kernel void TiltShift(__read_only image2d_t originalImg, __global unsigned int* blurredImg,
    __global unsigned int* outputImage, unsigned int upperBoundary, unsigned int lowerBoundary)
{
    int imgWidth = get_image_width(originalImg);
    int imgHeight = get_image_height(originalImg);
    sampler_t sampler = CLK_NORMALIZED_COORDS_FALSE | CLK_ADDRESS_CLAMP | CLK_FILTER_NEAREST;

    int row = get_global_id(0);
    int rowOffset = mul24(row, imgWidth);

    float blurPercent = 0.0f;
    float clearPercent = 1.0f;

    if (row < upperBoundary)
    {
        blurPercent = CalculateUpperBlurPercent(row, upperBoundary);
    }
    else if (row > lowerBoundary)
    {
        blurPercent = CalculateLowerBlurPercent(row, lowerBoundary, imgHeight);
    }

    clearPercent -= blurPercent;

    if (clearPercent < 0.0f)
    {
        clearPercent = -clearPercent;
    }

    if (row < imgHeight)
    {
        for (int col = 0; col < imgWidth; col++)
        {
            int2 pixelPos = {col, row};
            uint4 clearPixel = read_imageui(originalImg, sampler, pixelPos);
            uint4 blurPixel = BufferDataToPixel(blurredImg[rowOffset + col]);

            uint4 newPixel = ComposePixels(clearPixel, blurPixel, clearPercent, blurPercent);

            outputImage[rowOffset + col] = PixelToBufferData(newPixel);
        }
    }
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






// BoxFilter
/*
 * Copyright 1993-2010 NVIDIA Corporation.  All rights reserved.
 *
 * Please refer to the NVIDIA end user license agreement (EULA) associated
 * with this source code for terms and conditions that govern your use of
 * this software. Any use, reproduction, disclosure, or distribution of
 * this software and related documentation outside the terms of the EULA
 * is strictly prohibited.
 *
 */

// Inline device function to convert 32-bit unsigned integer to floating point rgba color 
//*****************************************************************
float4 rgbaUintToFloat4(unsigned int c);
unsigned int rgbaFloat4ToUint(float4 rgba, float fScale);

float4 rgbaUintToFloat4(unsigned int c) {
  float4 rgba;
  rgba.x = c & 0xff;
  rgba.y = (c >> 8) & 0xff;
  rgba.z = (c >> 16) & 0xff;
  rgba.w = (c >> 24) & 0xff;
  return rgba;
}

// Inline device function to convert floating point rgba color to 32-bit unsigned integer
//*****************************************************************
unsigned int rgbaFloat4ToUint(float4 rgba, float fScale) {
  unsigned int uiPackedPix = 0U;
  uiPackedPix |= 0x000000FF & (unsigned int) (rgba.x * fScale);
  uiPackedPix |= 0x0000FF00 & (((unsigned int) (rgba.y * fScale)) << 8);
  uiPackedPix |= 0x00FF0000 & (((unsigned int) (rgba.z * fScale)) << 16);
  uiPackedPix |= 0xFF000000 & (((unsigned int) (rgba.w * fScale)) << 24);
  return uiPackedPix;
}

// Row summation filter kernel with rescaling, using Image (texture)
// USETEXTURE switch passed in via OpenCL clBuildProgram call options string at app runtime
//*****************************************************************
// Row summation filter kernel with rescaling, using Image (texture)
__kernel void BoxRowsTex( __read_only image2d_t SourceRgbaTex, __global unsigned int* uiDest, sampler_t RowSampler, 
                         unsigned int uiWidth, unsigned int uiHeight, int iRadius, float fScale)
{
  // Row to process (note:  1 dimensional workgroup and ND range used for row kernel)
  size_t globalPosY = get_global_id(0);
  size_t szBaseOffset = mul24(globalPosY, uiWidth);
  
  // Process the row as long as Y pos isn'f4Sum off the image
  if (globalPosY < uiHeight) 
  {
    // 4 fp32 accumulators
    float4 f4Sum = (float4)0.0f;
    
    // Do the left boundary
    for(int x = -iRadius; x <= iRadius; x++)     // (note:  clamping provided by Image (texture))
    {
      int2 pos = {x , globalPosY};
      f4Sum += convert_float4(read_imageui(SourceRgbaTex, RowSampler, pos));  
    }
    uiDest[szBaseOffset] = rgbaFloat4ToUint(f4Sum, fScale);
    
    // Do the rest of the image
    int2 pos = {0, globalPosY};
    for(unsigned int x = 1; x < uiWidth; x++)           //  (note:  clamping provided by Image (texture)) 
    {
      // Accumulate the next rgba sub-pixel vals
      pos.x = x + iRadius;
      f4Sum += convert_float4(read_imageui(SourceRgbaTex, RowSampler, pos));  
      
      // Remove the trailing rgba sub-pixel vals
      pos.x = x - iRadius - 1;
      f4Sum -= convert_float4(read_imageui(SourceRgbaTex, RowSampler, pos));  
      
      // Write out to GMEM
      uiDest[szBaseOffset + x] = rgbaFloat4ToUint(f4Sum, fScale);
    }
  }
}

// Column kernel using coalesced global memory reads
//*****************************************************************
__kernel void BoxColumns(__global unsigned int* uiInputImage, __global unsigned int* uiOutputImage, 
                         unsigned int uiWidth, unsigned int uiHeight, int iRadius, float fScale)
{
    size_t globalPosX = get_global_id(0);
  uiInputImage = &uiInputImage[globalPosX];
  uiOutputImage = &uiOutputImage[globalPosX];
  
  // do left edge
  float4 f4Sum;
  f4Sum = rgbaUintToFloat4(uiInputImage[0]) * (float4)(iRadius);
  for (int y = 0; y < iRadius + 1; y++) 
  {
    f4Sum += rgbaUintToFloat4(uiInputImage[y * uiWidth]);
  }
  uiOutputImage[0] = rgbaFloat4ToUint(f4Sum, fScale);
  for(int y = 1; y < iRadius + 1; y++) 
  {
    f4Sum += rgbaUintToFloat4(uiInputImage[(y + iRadius) * uiWidth]);
    f4Sum -= rgbaUintToFloat4(uiInputImage[0]);
    uiOutputImage[y * uiWidth] = rgbaFloat4ToUint(f4Sum, fScale);
  }
  
  // main loop
  unsigned int y;
  for(y = iRadius + 1; y < uiHeight - iRadius; y++) 
  {
    f4Sum += rgbaUintToFloat4(uiInputImage[(y + iRadius) * uiWidth]);
    f4Sum -= rgbaUintToFloat4(uiInputImage[((y - iRadius) * uiWidth) - uiWidth]);
    uiOutputImage[y * uiWidth] = rgbaFloat4ToUint(f4Sum, fScale);
  }
  
  // do right edge
  for (y = uiHeight - iRadius; y < uiHeight; y++) 
  {
    f4Sum += rgbaUintToFloat4(uiInputImage[(uiHeight - 1) * uiWidth]);
    f4Sum -= rgbaUintToFloat4(uiInputImage[((y - iRadius) * uiWidth) - uiWidth]);
    uiOutputImage[y * uiWidth] = rgbaFloat4ToUint(f4Sum, fScale);
  }
}
