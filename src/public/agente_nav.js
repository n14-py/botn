document.getElementById('agentNav').innerHTML = `
<nav class="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 hidden md:block shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-20">
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                    <i class="fas fa-headset text-white text-lg"></i>
                </div>
                <div>
                    <h1 class="font-black text-xl text-slate-900 tracking-tight leading-none">GFYB</h1>
                    <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Agente Pro</span>
                </div>
            </div>

            <div class="flex items-center space-x-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
                <a href="agente_inicio.html" class="nav-item px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all flex items-center gap-2">
                    <i class="fas fa-inbox"></i> Pendientes
                </a>
                <a href="agente_seguimiento.html" class="nav-item px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-green-600 hover:bg-white hover:shadow-sm transition-all flex items-center gap-2">
                    <i class="fab fa-whatsapp"></i> Seguimiento
                </a>
                <a href="agente_buscador.html" class="nav-item px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-sm transition-all flex items-center gap-2">
                    <i class="fas fa-search"></i> Buscador
                </a>
                <a href="agente_ventas.html" class="nav-item px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-indigo-600 hover:bg-white hover:shadow-sm transition-all flex items-center gap-2">
                    <i class="fas fa-trophy"></i> Mis Ventas
                </a>
            </div>

            <button onclick="logout()" class="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Cerrar Turno">
                <i class="fas fa-sign-out-alt text-lg"></i>
            </button>
        </div>
    </div>
</nav>

<div class="md:hidden fixed top-0 left-0 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 z-40 px-5 py-4 flex justify-between items-center shadow-sm">
    <div class="flex items-center gap-2">
        <div class="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <i class="fas fa-headset text-white text-xs"></i>
        </div>
        <span class="font-bold text-slate-900 tracking-tight">GFYB <span class="text-indigo-600 font-normal">| Agente</span></span>
    </div>
    <button onclick="logout()" class="text-slate-300 hover:text-red-500 transition-colors"><i class="fas fa-power-off"></i></button>
</div>

<div class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 z-50 pb-safe shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
    <div class="flex justify-around items-center h-16 px-1">
        
        <a href="agente_inicio.html" class="mobile-link relative w-full h-full flex flex-col items-center justify-center group active:scale-95 transition-transform">
            <div class="icon-container h-8 w-12 rounded-full flex items-center justify-center mb-0.5 transition-all group-hover:bg-slate-50">
                <i class="fas fa-inbox text-xl text-slate-400 transition-colors"></i>
            </div>
            <span class="text-[10px] font-bold text-slate-400 transition-colors">Revisar</span>
        </a>

        <a href="agente_seguimiento.html" class="mobile-link relative w-full h-full flex flex-col items-center justify-center group active:scale-95 transition-transform">
            <div class="icon-container h-8 w-12 rounded-full flex items-center justify-center mb-0.5 transition-all group-hover:bg-slate-50">
                <i class="fab fa-whatsapp text-xl text-slate-400 transition-colors"></i>
            </div>
            <span class="text-[10px] font-bold text-slate-400 transition-colors">Contactar</span>
        </a>

        <div class="relative -top-5">
            <a href="agente_buscador.html" class="h-14 w-14 bg-indigo-600 rounded-2xl rotate-45 flex items-center justify-center shadow-lg shadow-indigo-500/40 active:scale-90 transition-all border-4 border-slate-50 group">
                <i class="fas fa-search text-white text-xl -rotate-45"></i>
            </a>
        </div>

        <a href="agente_ventas.html" class="mobile-link relative w-full h-full flex flex-col items-center justify-center group active:scale-95 transition-transform">
            <div class="icon-container h-8 w-12 rounded-full flex items-center justify-center mb-0.5 transition-all group-hover:bg-slate-50">
                <i class="fas fa-trophy text-xl text-slate-400 transition-colors"></i>
            </div>
            <span class="text-[10px] font-bold text-slate-400 transition-colors">Logros</span>
        </a>

        <a href="agente_historial.html" class="mobile-link relative w-full h-full flex flex-col items-center justify-center group active:scale-95 transition-transform">
            <div class="icon-container h-8 w-12 rounded-full flex items-center justify-center mb-0.5 transition-all group-hover:bg-slate-50">
                <i class="fas fa-clock text-xl text-slate-400 transition-colors"></i>
            </div>
            <span class="text-[10px] font-bold text-slate-400 transition-colors">Historial</span>
        </a>

    </div>
</div>

<style>
    /* Área segura para iPhone X+ */
    .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
    
    /* Indicador activo desktop */
    .nav-item.active { background-color: white; color: #4f46e5; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
    
    /* Indicador activo móvil */
    .mobile-link.active i { color: #4f46e5; }
    .mobile-link.active span { color: #4f46e5; }
    .mobile-link.active .icon-container { background-color: #eef2ff; }
</style>
`;

// Lógica para resaltar dónde estamos
const currentPath = window.location.pathname;
const allLinks = document.querySelectorAll('a');

allLinks.forEach(link => {
    if(link.getAttribute('href') && currentPath.includes(link.getAttribute('href'))) {
        link.classList.add('active');
        
        // Si es el nav de PC, limpiar clases base
        if(link.classList.contains('nav-item')) {
            link.classList.remove('text-slate-500', 'hover:bg-white');
        }
    }
});

// Función Global de Logout
window.logout = function() {
    Swal.fire({
        title: '¿Terminar Turno?',
        text: "Cerrarás tu sesión actual",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#cbd5e1',
        confirmButtonText: 'Sí, salir',
        cancelButtonText: 'Cancelar',
        customClass: { popup: 'rounded-3xl' }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('usuario');
            window.location.href = '/index.html';
        }
    });
};