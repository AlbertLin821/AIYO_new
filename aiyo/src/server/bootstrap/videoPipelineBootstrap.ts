/**
 * Side-effect bootstrap: initialize YouTube provider module graph before Ollama video extraction.
 * Prevents ESM init-order bugs where `chatWithOllama` fetch fails when service modules load first.
 */
import "@/server/providers/youtubeProvider";
