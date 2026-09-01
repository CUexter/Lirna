import {
  type Application,
  type CreateContextOptions,
  createContext,
} from "../context";

export function createTestApplication(
  adapters: Partial<Application> = {},
): Application {
  return {
    sepAdmissions: {
      async submit() {
        return unexpected();
      },
      async get() {
        return unexpected();
      },
      async extend() {
        return unexpected();
      },
      async delete() {
        return unexpected();
      },
      async retry() {
        return unexpected();
      },
      async admit() {
        return unexpected();
      },
      async checkUpdate() {
        return unexpected();
      },
    },
    admittedSourceStates: {
      async listSources() {
        return unexpected();
      },
      async deleteSource() {
        return unexpected();
      },
      async getState() {
        return unexpected();
      },
      async getReading() {
        return unexpected();
      },
      async getUpdateTarget() {
        return unexpected();
      },
    },
    annotations: {
      async list() {
        return unexpected();
      },
      async create() {
        return unexpected();
      },
      async update() {
        return unexpected();
      },
      async delete() {
        return unexpected();
      },
    },
    citationResolutions: {
      async list() {
        return unexpected();
      },
      async history() {
        return unexpected();
      },
      async evidence() {
        return unexpected();
      },
      async create() {
        return unexpected();
      },
      async clear() {
        return unexpected();
      },
    },
    readingPositions: {
      async get() {
        return unexpected();
      },
      async save() {
        return unexpected();
      },
    },
    readingWorkspaces: {
      async read() {
        return unexpected();
      },
    },
    researchThreads: {
      async create() {
        return unexpected();
      },
      async list() {
        return unexpected();
      },
      async get() {
        return unexpected();
      },
      async append() {
        return unexpected();
      },
    },
    derivativeUpdates: {
      async generate() {
        return unexpected();
      },
    },
    activeReadingDerivatives: {
      async read() {
        return unexpected();
      },
      async previewActivation() {
        return unexpected();
      },
      async activate() {
        return unexpected();
      },
    },
    offlineWorkingSets: {
      async capture() {
        return unexpected();
      },
    },
    ...adapters,
  };
}

export function createTestContext(
  adapters: Partial<Application> = {},
  options: Omit<CreateContextOptions, "application"> = {},
) {
  return createContext({
    application: createTestApplication(adapters),
    ...options,
  });
}

function unexpected(): never {
  throw new Error("Unexpected test adapter call");
}
