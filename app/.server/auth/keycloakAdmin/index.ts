export { adminFetch, type KeycloakGroup, type KeycloakUser } from "./client";

export {
  flattenGroups,
  findGroupByPath,
  getManageableScopes,
  getGroupWithMembers,
  flattenGroupsWithIds,
  collectAllUsers,
  type GroupWithMembers,
  type UserWithGroups,
  type GroupInfo,
} from "./groups";

export {
  inviteUser,
  updateUser,
  addUserToGroup,
  removeUserFromGroup,
} from "./users";
