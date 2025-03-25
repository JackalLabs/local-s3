/**
 * A simple sequential task queue
 */
export class Queue {
    private isProcessing = false;
    private taskQueue: Array<{
        task: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    }> = [];

    /**
     * Add a task to the queue
     * @param task Function to execute
     * @returns Promise that resolves with the task result
     */
    public async add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // Add task to queue
            this.taskQueue.push({
                task,
                resolve,
                reject
            });

            // Start processing if not already running
            if (!this.isProcessing) {
                this.processNext();
            }
        });
    }

    /**
     * Process the next task in the queue
     */
    private async processNext(): Promise<void> {
        if (this.taskQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;

        const { task, resolve, reject } = this.taskQueue.shift()!;

        try {
            // Execute the task and pass the result to the original caller
            const result = await task();
            resolve(result);
        } catch (error) {
            reject(error);
        }

        // Process the next task
        await this.processNext();
    }
}

// Usage:
// const queue = new Queue();
// const res = await queue.add(storage.processAllQueues);