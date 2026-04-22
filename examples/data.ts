// Shared data used by all framework entrypoints

export const todos: { id: number; text: string; done: boolean }[] = [
  { id: 1, text: 'Learn Sikka', done: false },
  { id: 2, text: 'Build an app', done: false },
];
export let nextId = 3;

export const team = [
  { name: 'Alice Johnson', role: 'Frontend Developer' },
  { name: 'Bob Smith', role: 'Backend Developer' },
  { name: 'Carol Williams', role: 'Designer' },
];

export const users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
  { id: 3, name: 'Carol Williams', email: 'carol@example.com' },
];

export const streamItems = [
  { title: 'Streaming', description: 'HTML chunks are sent as they are produced.', href: '#' },
  { title: 'Fast', description: 'Static content flushes immediately.', href: '#' },
  { title: 'Efficient', description: 'Component calls are awaited and yielded.', href: '#' },
];

export const streamTemplate = `---
const { items } = Astro.props;
---
<div>
  <h1>Streaming Demo</h1>
  <p>This page was streamed to you chunk by chunk.</p>
  {items.map((item) => (
    <Card title={item.title} description={item.description} href={item.href} />
  ))}
</div>`;

export function addTodo(text: string) {
  if (text) {
    todos.push({ id: nextId++, text, done: false });
  }
}

export function toggleTodo(id: number) {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
}

export function editTodo(id: number, text: string) {
  const todo = todos.find((t) => t.id === id);
  if (todo && text) todo.text = text;
}

export function deleteTodo(id: number) {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx !== -1) todos.splice(idx, 1);
}

export function findTodo(id: number) {
  return todos.find((t) => t.id === id);
}

export function findUser(id: number) {
  return users.find((u) => u.id === id);
}

export function findTeamMember(index: number) {
  return team[index] ?? undefined;
}
