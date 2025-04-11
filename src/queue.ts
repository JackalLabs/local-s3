/**
 * A simple sequential task queue
 */
export class Queue {
  private isProcessing
  private taskQueue: Array<() => Promise<any>>

  constructor() {
    this.isProcessing = false
    this.taskQueue = []
  }


  /**
   * Add a task to the queue
   * @param task Function to execute
   * @returns Promise that resolves with the task result
   */
  public async add<T>(task: () => Promise<T>): Promise<void> {
    this.taskQueue.push(task)
    if (!this.isProcessing) {
      await this.process()
    }
  }

  private async process(): Promise<void> {
    this.isProcessing = true
    while (this.taskQueue.length > 0) {
      await this.processOne()
    }
    this.isProcessing = false
  }

  /**
   * Process the next task in the queue
   */
  private async processOne(): Promise<void> {
    const task = this.taskQueue.shift()!
    new Promise(async (resolve, reject) => {
      try {
        const result = await task()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  }
}
