export type ApiResponse<T> = { success: boolean; message: string; data: T; error: string | null };
export function ok<T>(data: T, message = 'ok'): ApiResponse<T> { return { success: true, message, data, error: null }; }
export function fail(message: string): ApiResponse<Record<string, never>> { return { success: false, message, data: {}, error: message }; }
