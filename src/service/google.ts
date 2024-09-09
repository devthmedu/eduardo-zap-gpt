// Importa as dependências necessárias
import { type ChatSession, GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Carrega variáveis de ambiente do arquivo .env
dotenv.config();

// Inicializa o cliente do Google Generative AI com a chave da API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!);
// Obtém o modelo generativo "gemini-pro"
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
// Mapa para armazenar sessões de chat ativas, associadas ao ID do chat
const activeChats = new Map();

// Função para obter ou criar uma sessão de chat
const getOrCreateChatSession = (chatId: string): ChatSession => {
  console.log('activeChats.has(chatId)', activeChats.has(chatId));

  // Verifica se já existe uma sessão de chat para o chatId
  if (activeChats.has(chatId)) {
    const currentHistory = activeChats.get(chatId);
    console.log({ currentHistory, chatId });
    // Se existe, retorna a sessão com o histórico atual
    return model.startChat({
      history: currentHistory,
    });
  }

  // Se não existe, cria um novo histórico com um prompt inicial
  const history = [
    {
      role: 'user',
      parts: process.env.GEMINI_PROMPT ?? 'oi',
    },
    {
      role: 'model',
      parts: 'Olá, certo!',
    },
  ];

  // Armazena o novo histórico para o chatId
  activeChats.set(chatId, history);

  // Inicia uma nova sessão de chat com o histórico inicial
  return model.startChat({
    history,
  });
};

// Função principal para interagir com o modelo generativo do Google
export const mainGoogle = async ({
  currentMessage,
  chatId,
}: {
  currentMessage: string;
  chatId: string;
}): Promise<string> => {
  // Obtém ou cria uma sessão de chat para o chatId
  const chat = getOrCreateChatSession(chatId);
  const prompt = currentMessage;

  // Envia a mensagem para o modelo e obtém a resposta
  const result = await chat.sendMessage(prompt);
  const response = await result.response;
  const text = response.text();

  // Atualiza o histórico do chat com a mensagem do usuário e a resposta do modelo
  activeChats.set(chatId, [
    ...activeChats.get(chatId),
    {
      role: 'user',
      parts: prompt,
    },
    {
      role: 'model',
      parts: text,
    },
  ]);

  console.log('Resposta Gemini: ', text);

  // Retorna o texto da resposta
  return text;
};
