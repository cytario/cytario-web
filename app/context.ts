import { createContext } from "react-router";

import { UserProfile } from "./.server/auth/getUserInfo";

export const userContext = createContext<UserProfile | null>(null);
