const fs = require('fs');
let code = fs.readFileSync('app/RevITApp.tsx', 'utf-8');

const startStr = "async function removeAiChat(chat: AiChat) {";
const endStr = `async function ask(question: string) {`;
const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    const replacementMethod = `async function removeAiChat(chat: AiChat) {
    if (!cloudEnabled || !initialUser || pending || chatActionPending) return;
    
    requestConfirm("Delete conversation?", \`Delete “\${chat.title}”? This conversation cannot be recovered.\`, "Delete", async () => {
      setChatActionPending(true);
      setChatError("");
      try {
        await deleteAiChat(createClient(), initialUser.id, chat.id);
        const remaining = aiChats.filter((item) => item.id !== chat.id);
        setAiChats(remaining);
        if (activeChatId === chat.id) {
          const nextChatId = remaining[0]?.id ?? null;
          setMessages([]);
          setLoadedChatId(null);
          setActiveChatId(nextChatId);
        }
      } catch {
        setChatError("The conversation could not be deleted. Please try again.");
      } finally {
        setChatActionPending(false);
      }
    });
  }

  `;
    code = code.substring(0, startIdx) + replacementMethod + code.substring(endIdx);
    fs.writeFileSync('app/RevITApp.tsx', code);
    console.log("Replaced removeAiChat successfully.");
} else {
    console.log("Could not find boundaries", startIdx, endIdx);
}
