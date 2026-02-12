export interface WorkerTaskData {
  buffer: ArrayBuffer;
  maxUncompressedSize: number;
  decoderId: string;
}
export interface WorkerTaskEvent {
  taskId: string;
  result: ArrayBuffer;
  error: Error;
}

export interface WorkerTask {
  taskId: string;
  data: WorkerTaskData;
  resolve: (result: ArrayBuffer) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, WorkerTask> = new Map();
  private workerQueue: Worker[] = [];

  constructor(workerPath: string, poolSize: number = 4) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerPath, { type: "module" });

      worker.onmessage = (event: MessageEvent<WorkerTaskEvent>) => {
        const { taskId, result, error } = event.data;

        const task = this.activeTasks.get(taskId);
        if (task) {
          if (error) {
            task.reject(error);
          } else {
            task.resolve(result);
          }

          this.activeTasks.delete(taskId);
        }

        // Return the worker to the queue and process next task
        this.workerQueue.push(worker);
        this.processQueue();
      };

      this.workers.push(worker);
      this.workerQueue.push(worker);
    }
  }

  private processQueue() {
    if (this.taskQueue.length > 0 && this.workerQueue.length > 0) {
      const worker = this.workerQueue.shift()!;
      const task = this.taskQueue.shift()!;

      this.activeTasks.set(task.taskId, task);

      worker.postMessage({ taskId: task.taskId, ...task.data });
    }
  }

  public runTask(data: WorkerTaskData): Promise<ArrayBuffer> {
    const taskId = Math.random().toString(36).substring(2);

    return new Promise((resolve, reject) => {
      const task: WorkerTask = { taskId, data, resolve, reject };
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  public terminate() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.workerQueue = [];
    this.taskQueue = [];
    this.activeTasks.clear();
  }
}
