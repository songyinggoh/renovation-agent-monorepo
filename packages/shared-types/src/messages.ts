export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_TYPES = ['text', 'image', 'tool_call', 'tool_result'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];
