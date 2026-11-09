export function stateLabel(state: string) {
  return state.replaceAll('-', ' ');
}
export function timeLabel(time: string) {
  return new Date(time).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
export function short(id: string) {
  return id.slice(0, 8);
}
