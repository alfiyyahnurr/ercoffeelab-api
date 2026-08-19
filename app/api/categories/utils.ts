export function formatCategory(row: any) {
  return {
    id: Number(row.id),
    name: row.name,
    groupName: row.group_name ?? row.groupName ?? "beverage",
  };
}
