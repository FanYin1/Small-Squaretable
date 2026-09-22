/**
 * 上传接口的前后端共享契约。
 *
 * 单独成文件的理由：此前前端 upload.api.ts 发 `file` 字段、打 `/uploads/images`，
 * 服务端 uploads.ts 读的是 `audio` / `image` 字段、挂的是 `/audio` / `/image`。
 * 字段名和路径两处都不匹配，所以音频上传（唯一接线的调用方，
 * MessageInput.vue 的语音消息）必然返回 400 MISSING_FILE，图片上传则 404。
 *
 * 两侧各自的单元测试都是绿的——服务端测试自己 append('audio')，
 * 前端测试自己断言 append('file')，谁都没有跨过边界验证另一侧。
 * 契约只要还分散在两份代码里，就还会再漂一次；所以放在这里，
 * 由 upload.spec.ts 钉住，两侧都从这里取值。
 */

/** multipart 表单里文件字段的名字 */
export const UPLOAD_FIELD = {
  audio: 'audio',
  image: 'image',
} as const;

/** 相对 /api/v1 的上传端点路径 */
export const UPLOAD_PATH = {
  audio: '/uploads/audio',
  image: '/uploads/image',
} as const;

export type UploadKind = keyof typeof UPLOAD_FIELD;

/** 上传成功后的响应体（apiRequest 会解包 ApiResponse.data） */
export interface UploadResult {
  url: string;
}
