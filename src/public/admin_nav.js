// 1. Inyectamos solo el HTML (Estructura visual)
document.getElementById('navbar').innerHTML = `
<nav class="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 hidden md:block shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-20">
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20">
                    <i class="fas fa-shield-alt text-white text-lg"></i>
                </div>
                <div>
                    <h1 class="font-black text-xl text-slate-900 tracking-tight leading-none">GFYB</h1>
                    <span class="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Panel Dueño</span>
                </div>
            </div>

            <div class="flex items-center space-x-1">
                <a href="admin_dashboard.html" class="nav-item px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2">
                    <i class="fas fa-chart-pie"></i> Resumen
                </a>
                <a href="admin_ganancias.html" class="nav-item px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-green-600 hover:bg-green-50 transition-all flex items-center gap-2">
                    <i class="fas fa-wallet"></i> Ganancias
                </a>
                <a href="admin_lista.html" class="nav-item px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-2">
                    <i class="fas fa-database"></i> Base Datos
                </a>
                
                <div class="h-6 w-px bg-slate-200 mx-2"></div>

                <a href="admin_manual.html" class="nav-item px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all">
                    <i class="fas fa-keyboard mr-1"></i> Manual
                </a>
                <a href="admin_carga.html" class="nav-item px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all">
                    <i class="fas fa-file-excel mr-1"></i> Excel
                </a>
                
                <div class="h-6 w-px bg-slate-200 mx-2"></div>

                <a href="admin_horario.html" class="nav-item px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-all" title="Configuración Bot">
                    <i class="fas fa-robot"></i>
                </a>
            </div>

            <button onclick="logout()" class="ml-4 p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Cerrar Sesión">
                <i class="fas fa-power-off text-lg"></i>
            </button>
        </div>
    </div>
</nav>

<div class="md:hidden fixed top-0 left-0 w-full bg-white/90 backdrop-blur-md border-b border-slate-200 z-40 px-5 py-4 flex justify-between items-center shadow-sm">
    <div class="flex items-center gap-2">
        <div class="h-8 w-8 bg-slate-900 rounded-lg flex items-center justify-center">
            <i class="fas fa-shield-alt text-white text-xs"></i>
        </div>
        <span class="font-bold text-slate-900">GFYB <span class="text-slate-400 font-normal">| Admin</span></span>
    </div>
    <button onclick="logout()" class="text-slate-400 hover:text-red-500"><i class="fas fa-power-off"></i></button>
</div>

<div class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 z-50 pb-safe pt-2 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
    <div class="flex justify-around items-center pb-2">
        <a href="admin_dashboard.html" class="mobile-link flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all">
            <i class="fas fa-chart-pie text-xl mb-1 text-slate-400"></i>
            <span class="text-[10px] font-bold text-slate-400">Dash</span>
        </a>
        <a href="admin_ganancias.html" class="mobile-link flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all">
            <i class="fas fa-wallet text-xl mb-1 text-slate-400"></i>
            <span class="text-[10px] font-bold text-slate-400">$$$</span>
        </a>
        
        <div class="relative -top-6">
            <a href="admin_manual.html" class="h-14 w-14 bg-slate-900 rounded-full flex items-center justify-center shadow-lg shadow-slate-900/40 transform active:scale-95 transition-all border-4 border-slate-50">
                <i class="fas fa-plus text-white text-2xl"></i>
            </a>
        </div>

        <a href="admin_lista.html" class="mobile-link flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all">
            <i class="fas fa-users text-xl mb-1 text-slate-400"></i>
            <span class="text-[10px] font-bold text-slate-400">Datos</span>
        </a>
        <a href="admin_horario.html" class="mobile-link flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all">
            <i class="fas fa-robot text-xl mb-1 text-slate-400"></i>
            <span class="text-[10px] font-bold text-slate-400">Bot</span>
        </a>
    </div>
</div>

<style>
    @media (max-width: 768px) {
        body { padding-top: 80px; padding-bottom: 100px; }
    }
    .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
</style>
`;

// 2. Ejecutamos la lógica Javascript directamente (FUERA del innerHTML)

// Resaltar enlace activo
const path = window.location.pathname;
const links = document.querySelectorAll('a');

links.forEach(link => {
    if(link.getAttribute('href') && path.includes(link.getAttribute('href'))) {
        // Estilo Desktop
        if(link.classList.contains('nav-item')) {
            link.classList.remove('text-slate-500');
            link.classList.add('bg-slate-100', 'text-slate-900');
        }
        // Estilo Móvil
        if(link.classList.contains('mobile-link')) {
            const icon = link.querySelector('i');
            const text = link.querySelector('span');
            icon.classList.remove('text-slate-400');
            icon.classList.add('text-blue-600');
            text.classList.remove('text-slate-400');
            text.classList.add('text-blue-600');
        }
    }
});

// Función de Cerrar Sesión (Global)
window.logout = function() {
    Swal.fire({
        title: '¿Cerrar Sesión?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        cancelButtonColor: '#ef4444',
        confirmButtonText: 'Sí, salir'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('usuario');
            window.location.href = '/index.html';
        }
    });
};

// ⚡ FIX PARA WEB APP (PWA) ⚡
// Esto detecta clics en enlaces de WhatsApp y fuerza su apertura en la app nativa
document.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (link && (link.href.includes('wa.me') || link.href.includes('whatsapp.com'))) {
        e.preventDefault();
        // Abrir en una nueva ventana/pestaña fuerza al navegador a manejar el intent
        window.open(link.href, '_blank', 'noopener,noreferrer');
    }
});