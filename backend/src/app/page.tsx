import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,157,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,157,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

      <main className="z-10 text-center p-8 border border-green-500/30 bg-black/80 backdrop-blur-sm rounded-lg shadow-[0_0_20px_rgba(0,255,157,0.2)]">
        <h1 className="text-6xl font-bold mb-4 animate-pulse pt-2">RETAIL SCRAPER</h1>
        <p className="text-xl mb-8 tracking-widest text-green-300/80">SECURE DATA EXTRACTION TERMINAL</p>

        <div className="flex flex-col gap-4 max-w-md mx-auto">
          <Link
            href="/admin/login"
            className="px-8 py-3 bg-green-500/10 border border-green-500 hover:bg-green-500 hover:text-black transition-all duration-300 font-bold tracking-wider text-sm group"
          >
            <span className="group-hover:hidden">ACCESS ADMIN PANEL &gt;</span>
            <span className="hidden group-hover:inline">ESTABLISH CONNECTION &gt;&gt;</span>
          </Link>

          <div className="text-xs text-green-600 mt-8 border-t border-green-900 pt-4">
            STATUS: ONLINE<br />
            VERSION: 1.0.0
          </div>
        </div>
      </main>
    </div>
  );
}
