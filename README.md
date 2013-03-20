TiltShiftWebCL
==============

CSC 520, Grad Computer Architecture Project


Usage
==============

```javascript
node TiltShift.js deviceID imageFileName lowerBoundary upperBoundary
```

deviceID - A number between 0 and however many devices you have. Run with 0 one time to see a list of devices.
imageFileNmae - Image file name, with extension
lowerBoundary - The distance from the bottom of the image to stop blurring
upperBoundary - The distance from the bottom of the image to start blurring again, blurs all the way to the top
