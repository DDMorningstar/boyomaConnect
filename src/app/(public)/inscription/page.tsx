import { redirect } from "next/navigation";

/** L'inscription se fait avec Google, sur la même page que la connexion. */
export default function SignUpPage() {
  redirect("/connexion");
}
