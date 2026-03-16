import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:3000';

export const chatApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const sendChatMessage = async (videoId: string, prompt: string, threadId: string) => {
  const response = await chatApi.post('/chat', {
    video_id: videoId,
    prompt: prompt,
    thread_id: threadId,
  });
  return response.data;
};
