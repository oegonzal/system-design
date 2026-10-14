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

interface PriorityQueueInterface<T> {
  push(priority: number, payload: T): void;
  peek(): Promise<T>;
  pop(): Promise<T>;
}

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}

interface QueueItem<T> {
  priority: number;
  payload: T;
}
class PriorityQueue<T> implements PriorityQueueInterface<T> {
  private queue: QueueItem<T>[] = [];
  private waiters: Deferred<void>[] = [];

  // private firstResolve!: (value: T) => void;;
  // private firstItem: Promise<T> = new Promise((resolve: (value:T) => void) => this.firstResolve = resolve);

  push(priority: number, payload: T) {
    const newItem = { priority, payload };

    if (this.queue.length === 0) {
      this.queue.push(newItem);

      // this.waiters.push( new Deferred() );

      // this.firstResolve(payload);
    } else {
      let prev = newItem;

      for (let idx = 0; idx < this.queue.length; idx++) {
        const item = this.queue[idx];
        if (priority >= item.priority) {
          const curr = prev;
          prev = item;
          this.queue[idx] = curr;
        }
      }
      this.queue.push(prev);

      // const idx = this.queue.findIndex((item) => item.priority <= priority);
      // if (idx !== -1) this.queue.push( newItem );
      // else this.queue.splice(idx, 0, newItem);

      // for ( let i = 0; i < this.waiters.length; i++ ) {
      //     this.waiters.pop()!.resolve();
      // }
    }

    if (this.waiters.length > 0) {
      const oldestWaiter = this.waiters.shift()!;
      oldestWaiter.resolve();
    }
    return;
  }

  async peek() {
    while (this.queue.length === 0) {
      const deferred = new Deferred<void>();
      this.waiters.push(deferred);
      await deferred.promise;
    }

    return this.queue[this.queue.length - 1].payload;

    // if ( this.queue.length > 0 ) {
    //     return new Promise(
    //         (resolve: (value:T) => void) => resolve( this.queue[this.queue.length - 1].payload )
    //     );
    // } else {
    //     await this.waiters[this.waiters.length - 1];
    //     return this.queue[this.queue.length - 1].payload;

    //     // return await this.firstItem;
    // }
  }

  async pop() {
    while (this.queue.length == 0) {
      const deferred = new Deferred<void>();
      this.waiters.push(deferred);
      await deferred.promise;
    }

    const item = this.queue.pop();
    return item!.payload;

    // if ( this.queue.length > 0 ) {
    //     const item = this.queue.pop();
    //     return new Promise(
    //         (resolve: (value:T) => void) => resolve( item!.payload )
    //     );
    // } else {
    //     await this.waiters[this.waiters.length - 1];
    //     return this.queue.pop()!.payload;
    //     // return await this.firstItem;
    // }
  }
}

/*

interface PriorityQueueInterface<T> {
  push(priority: number, payload: T): void;
  peek(): Promise<T>;
  pop(): Promise<T>;
}




interface QueueItem<T> {
  priority: number;
  payload: T;
}





// A simple Deferred Promise factory to completely remove promise constructor clutter
class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((res) => { this.resolve = res; });
  }
}






class PriorityQueue<T> implements PriorityQueueInterface<T> {
  


private queue: QueueItem<T>[] = [];
  


  // A clean array tracking anyone waiting for data.
  // This handles multiple concurrent pops/peeks perfectly without shared-state bugs.
  private waiters: Deferred<void>[] = [];



  push(priority: number, payload: T): void {
    const newItem = { priority, payload };
    
    // Simplifed stable sorting insertion (highest priority at the end)
    const idx = this.queue.findIndex(item => priority <= item.priority);
    if (idx === -1) this.queue.push(newItem);
    else this.queue.splice(idx, 0, newItem);

    // If someone is waiting for data, unblock the oldest waiter
    if (this.waiters.length > 0) {
      const nextWaiter = this.waiters.shift()!;
      nextWaiter.resolve();
    }
  }




  async peek(): Promise<T> {
    // If empty, wait until a push triggers a signal
    while (this.queue.length === 0) {
      const deferred = new Deferred<void>();
      this.waiters.push(deferred);
      await deferred.promise;
    }
    return this.queue[this.queue.length - 1].payload;
  }



  async pop(): Promise<T> {
    // If empty, wait until a push triggers a signal
    while (this.queue.length === 0) {
      const deferred = new Deferred<void>();
      this.waiters.push(deferred);
      await deferred.promise;
    }
    return this.queue.pop()!.payload;
  }



}

*/

/*


interface PriorityQueueInterface<T> {
  push(priority: number, payload: T): void;
  peek(): Promise<T>;
  pop(): Promise<T>;
}

interface QueueItem<T> {
  priority: number;
  payload: T;
}

class PriorityQueue<T> implements PriorityQueueInterface<T> {
  // Sorts items in ascending order so the highest priority sits at the end (for O(1) array pop)
  private queue: QueueItem<T>[] = [];
  
  // Track the pending promise and its isolated resolve controller
  private firstItem!: Promise<T>;
  private resolveFirstItem!: (value: T) => void;

  constructor() {
    this.resetSignalGate();
  }

  private resetSignalGate() {
    this.firstItem = new Promise<T>((resolve) => {
      this.resolveFirstItem = resolve;
    });
  }

  push(priority: number, payload: T): void {
    const newItem = { priority, payload };
    const wasEmpty = this.queue.length === 0;

    // Standard binary-search or linear insertion to maintain priority sorted order
    // Keeping highest priority at the array's end for efficient pop()
    let inserted = false;
    for (let idx = 0; idx < this.queue.length; idx++) {
      if (priority <= this.queue[idx].priority) {
        this.queue.splice(idx, 0, newItem);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(newItem);
    }

    // If the queue was empty, this push unblocks any in-flight pop() or peek()
    if (wasEmpty) {
      // The highest priority item is now at the very end of the array
      const highestPriorityItem = this.queue[this.queue.length - 1];
      this.resolveFirstItem(highestPriorityItem.payload);
    }
  }

  async peek(): Promise<T> {
    if (this.queue.length > 0) {
      return this.queue[this.queue.length - 1].payload;
    }
    
    // In-flight tracking: Wait until the signal gate fires
    return this.firstItem;
  }

  async pop(): Promise<T> {
    if (this.queue.length > 0) {
      const item = this.queue.pop()!;
      
      // Critical Step: If we just took the last item, reset the promise gate 
      // so the next pop() blocks correctly instead of falling through.
      if (this.queue.length === 0) {
        this.resetSignalGate();
      }
      
      return item.payload;
    }

    // In-flight tracking: Wait for a push to resolve the current gate
    const payload = await this.firstItem;
    
    // Clean up the consumed item from the actual queue data structure
    this.queue.pop(); 
    this.resetSignalGate();
    
    return payload;
  }
}



*/
