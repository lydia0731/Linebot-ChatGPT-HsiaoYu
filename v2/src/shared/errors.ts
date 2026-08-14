export class ConfigurationError extends Error {
  override name = "ConfigurationError";
}

export class ExternalServiceError extends Error {
  override name = "ExternalServiceError";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}
