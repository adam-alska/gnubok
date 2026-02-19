import { z } from 'zod'

// POST /api/chat and POST /api/chat/stream
export const ChatRequestSchema = z.object({
  message: z.string()
    .min(1, 'Message is required')
    .max(5000, 'Message too long'),
  session_id: z.string().uuid('Invalid session ID').optional(),
})

// POST /api/chat/sessions
export const CreateChatSessionSchema = z.object({
  title: z.string().max(200, 'Title too long').nullish(),
})

// PATCH /api/chat/sessions/[id]
export const UpdateChatSessionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
})

export type ChatRequestZ = z.infer<typeof ChatRequestSchema>
export type CreateChatSessionZ = z.infer<typeof CreateChatSessionSchema>
export type UpdateChatSessionZ = z.infer<typeof UpdateChatSessionSchema>
