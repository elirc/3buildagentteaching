import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@agentic-edu/ui";
import { ROLE_LABELS } from "@agentic-edu/shared";
import { getCurrentUser, listSwitchableUsers } from "@/lib/current-user";

async function switchUser(formData: FormData) {
  "use server";
  const userId = String(formData.get("userId") ?? "");
  const cookieStore = await cookies();
  cookieStore.set("active_user_id", userId, { path: "/", sameSite: "lax" });
  redirect("/settings");
}

export async function DevUserSwitcher() {
  const [users, currentUser] = await Promise.all([listSwitchableUsers(), getCurrentUser()]);

  return (
    <form action={switchUser}>
      <select name="userId" defaultValue={currentUser?.id}>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} - {ROLE_LABELS[user.role]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary">
        Switch
      </Button>
    </form>
  );
}
