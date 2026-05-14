import { handlers } from "@/auth";

// Thin shim — Auth.js' handlers object holds GET + POST.
export const { GET, POST } = handlers;
