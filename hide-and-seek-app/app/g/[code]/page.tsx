import Game from "./Game";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Game code={decodeURIComponent(code).toUpperCase()} />;
}
