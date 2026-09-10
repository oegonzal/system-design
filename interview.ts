// Given two sorted arrays, merge them into a single sorted array.
// You have O(n+m) time, but what about space?

// Can you do it in O(1) extra space
// if the first array has extra capacity?

// Inpute:
// Array 1: [1, 5, 9, 10, 15, 20, 0, 0, 0, 0, 0, 0] (size 12, but only first 6 are filled)
// Array 2: [2, 3, 8, 13]

// Result: [1, 2, 3, 5, 8, 9, 10, 13, 15, 20]

function mergeArrays(arr1: number[], arr2: number[]) {
  if (arr1.length < arr2.length) {
    let arr = arr1;
    arr1 = arr2;
    arr2 = arr;
  }

  // Get indx of last big number in arr
  let indx = 0;
  for (indx = 0; indx < arr1.length; indx++) {
    if (arr1[indx + 1] < arr1[indx]) break;
  }

  // [1, 5, 9, 10, 15, 20, 0, 0, 0, 0, 0, 0]
  //                    ^ indx = 5 AND length is 12
  let buffer = arr1.length - (indx + arr2.length);

  // 12 - 4 - 1 =
  let lastIndx1 = indx;
  let lastIndx2 = arr2.length - 1;

  for (let cursor = lastIndx1; cursor >= 0; cursor--) {
    if (arr1[lastIndx1] < arr2[lastIndx2]) {
      arr1[cursor] = arr2[lastIndx2];
      lastIndx2--;
    } else {
      arr1[cursor] = arr2[lastIndx1];
      lastIndx1--;
    }
    cursor--;
  }

  // [0, 0, ...]
  for (; buffer > 0; buffer--) {
    arr1.shift();
  }

  return arr1;
}

// [8, 15, 13, 0, 13, 0, undefined, 0, undefined]

const arr1 = [1, 5, 9, 10, 15, 20, 0, 0, 0, 0, 0, 0];
const arr2 = [2, 3, 8, 13];
mergeArrays(arr1, arr2);
