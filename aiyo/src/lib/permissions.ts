export type CollaboratorRole = "owner" | "editor" | "viewer";

export type CollaboratorPermission = "view" | "edit" | "invite" | "delete" | "managePermissions";

const rolePermissions: Record<CollaboratorRole, CollaboratorPermission[]> = {
  owner: ["view", "edit", "invite", "delete", "managePermissions"],
  editor: ["view", "edit"],
  viewer: ["view"],
};

export function canCollaborator(
  role: CollaboratorRole | undefined,
  permission: CollaboratorPermission,
): boolean {
  if (!role) {
    return false;
  }
  return rolePermissions[role].includes(permission);
}
