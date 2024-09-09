// Importa as bibliotecas necessárias
import wppconnect from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';
import { initializeNewAIChatSession, mainOpenAI } from './service/openai';
import { splitMessages, sendMessagesWithDelay } from './util';
import { mainGoogle } from './service/google';

// Carrega variáveis de ambiente do arquivo .env
dotenv.config();

// Define o tipo de IA disponível
type AIOption = 'GPT' | 'GEMINI';

// Cria mapas para armazenar o buffer de mensagens e timeouts
const messageBufferPerChatId = new Map<string, string[]>();
const messageTimeouts = new Map<string, NodeJS.Timeout>();

// Obtém a opção de IA selecionada do ambiente, padrão é 'GEMINI'
const AI_SELECTED: AIOption = (process.env.AI_SELECTED as AIOption) || 'GEMINI';
const MAX_RETRIES = 3;

// Verifica se as chaves necessárias para a IA selecionada estão presentes no ambiente
if (AI_SELECTED === 'GEMINI' && !process.env.GEMINI_KEY) {
  throw new Error(
    'Você precisa colocar uma key do Gemini no .env! Crie uma gratuitamente em https://aistudio.google.com/app/apikey?hl=pt-br'
  );
}

if (
  AI_SELECTED === 'GPT' &&
  (!process.env.OPENAI_KEY || !process.env.OPENAI_ASSISTANT)
) {
  throw new Error(
    'Para utilizar o GPT você precisa colocar no .env a sua key da OpenAI e o id do seu assistente.'
  );
}

// Cria uma nova sessão do cliente WPPConnect
wppconnect.create({
  session: 'sessionName',
  catchQR: (base64Qrimg, asciiQR) => {
    // Exibe o QR Code no terminal para autenticação
    console.log('Terminal QR Code:', asciiQR);
  },
  statusFind: (statusSession, session) => {
    // Exibe o status da sessão
    console.log('Status Session:', statusSession);
    console.log('Session Name:', session);
  },
  headless: 'new' as any,
})
.then((client) => {
  // Inicia o bot após a criação do cliente
  start(client);
})
.catch((error) => {
  // Exibe erros se a criação do cliente falhar
  console.error('Erro ao iniciar o cliente:', error);
});

// Função principal que lida com as mensagens recebidas
async function start(client: wppconnect.Whatsapp): Promise<void> {
  client.onMessage(async (message) => {
    // Verifica se a mensagem é de chat e não é de grupo ou status
    if (
      message.type === 'chat' &&
      !message.isGroupMsg &&
      message.chatId !== 'status@broadcast'
    ) {
      const chatId = message.chatId;
      console.log('Mensagem recebida:', message.body);

      // Inicializa uma nova sessão de chat para GPT, se selecionado
      if (AI_SELECTED === 'GPT') {
        await initializeNewAIChatSession(chatId);
      }

      // Adiciona a mensagem ao buffer de mensagens
      if (!messageBufferPerChatId.has(chatId)) {
        messageBufferPerChatId.set(chatId, [message.body]);
      } else {
        messageBufferPerChatId.get(chatId)?.push(message.body);
      }

      // Limpa o timeout existente para evitar múltiplas respostas
      if (messageTimeouts.has(chatId)) {
        clearTimeout(messageTimeouts.get(chatId)!);
      }

      console.log('Aguardando novas mensagens...');

      // Configura um novo timeout para processar a mensagem
      messageTimeouts.set(
        chatId,
        setTimeout(async () => {
          try {
            // Junta as mensagens do buffer e obtém uma resposta da IA
            const currentMessage = messageBufferPerChatId.get(chatId)?.join(' \n ') || message.body;
            let answer = '';

            // Tenta obter uma resposta da IA, com múltiplas tentativas em caso de falha
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                if (AI_SELECTED === 'GPT') {
                  answer = await mainOpenAI({ currentMessage, chatId });
                } else {
                  answer = await mainGoogle({ currentMessage, chatId });
                }
                break;
              } catch (error) {
                if (attempt === MAX_RETRIES) {
                  throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // Espera antes da próxima tentativa
              }
            }

            // Divide a resposta em mensagens menores e envia com atraso
            const messages = splitMessages(answer);
            console.log('Enviando mensagens...');
            await sendMessagesWithDelay({ client, messages, targetNumber: message.from });

          } catch (error) {
            // Exibe erros ao processar a mensagem
            console.error('Erro ao processar mensagem:', error);
          } finally {
            // Limpa o buffer e os timeouts após o processamento
            messageBufferPerChatId.delete(chatId);
            messageTimeouts.delete(chatId);
          }
        }, 1000) // Tempo de espera de 15 segundos
      );
    }
  });
}
