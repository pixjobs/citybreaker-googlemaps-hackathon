import WestminsterMap from "@/components/WestminsterMap";
import FABMenu from "@/components/FABMenu";

export default function LondonMapPage() {
  return (
    <div className="w-full h-screen relative overflow-hidden">
      <WestminsterMap />
      <FABMenu />
    </div>
  );
}
