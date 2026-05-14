export function toolResult<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data
  };
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const
  };
}
