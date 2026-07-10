/**
 * Standard API success response wrapper.
 * All successful responses from the API use this format.
 */
export class ApiResponse<T = unknown> {
  public readonly success: boolean = true;
  public readonly statusCode: number;
  public readonly message: string;
  public readonly data: T;

  constructor(statusCode: number, data: T, message: string = "Success") {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  /**
   * Convenience static factory methods
   */
  static ok<T>(data: T, message?: string): ApiResponse<T> {
    return new ApiResponse(200, data, message ?? "Success");
  }

  static created<T>(data: T, message?: string): ApiResponse<T> {
    return new ApiResponse(201, data, message ?? "Created successfully");
  }

  static noContent(): ApiResponse<null> {
    return new ApiResponse(204, null, "No content");
  }
}
