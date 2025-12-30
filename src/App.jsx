import StandbyList from "./components/StandbyList";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-4">
        <StandbyList />
      </div>
    </div>
  );
}
