import { ConsoleRoute } from "@/components/console/route";

export default async function Page({ params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  return <ConsoleRoute segments={segments}/>;
}
