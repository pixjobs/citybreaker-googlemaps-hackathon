import FABMenu from "@/components/FABMenu";

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-screen relative overflow-hidden bg-white">
      {/* placeholder for a top bar if needed */}
      <div className="absolute top-0 w-full p-4 text-center text-lg font-bold z-50 bg-white/70 backdrop-blur-sm shadow-sm">
        London
      </div>
      {children}
      <FABMenu />
    </div>
  );
}
