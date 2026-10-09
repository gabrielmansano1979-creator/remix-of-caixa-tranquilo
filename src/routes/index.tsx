import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAuthRedirect() {
  useEffect(() => {
    let isMounted = true;

    const checkAndRedirect = async () => {
      // 1. Processa o token direto da URL se estiver presente no hash (#access_token=...)
      if (window.location.hash && window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (!error && data.session?.user && isMounted) {
            const userEmail = data.session.user.email;
            const userRole = data.session.user.user_metadata?.role;
            const isAdmin = userEmail === 'gabrielmansano1979@gmail.com' || userRole === 'admin';

            window.location.replace(isAdmin ? '/admin' : '/caixa');
            return;
          }
        }
      }

      // 2. Se já houver uma sessão ativa salva no navegador
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted) {
        const userEmail = session.user.email;
        const userRole = session.user.user_metadata?.role;
        const isAdmin = userEmail === 'gabrielmansano1979@gmail.com' || userRole === 'admin';

        window.location.replace(isAdmin ? '/admin' : '/caixa');
      }
    };

    checkAndRedirect();

    return () => {
      isMounted = false;
    };
  }, []);
}