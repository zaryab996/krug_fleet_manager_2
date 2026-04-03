import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/hooks/useStore';
import { useUsersStore } from '@/hooks/useStore';
import { ROUTE_PATHS } from '@/lib/index';
import { useTranslation } from 'react-i18next';

export default function LoginPage() {
  const { t } = useTranslation();
  const { loginAsync } = useAuthStore();
  const { users } = useUsersStore();
  const navigate = useNavigate();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState(false);
  const [loading, setLoading]           = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);
    try {
      const ok = await loginAsync(email, password, users);
      if (ok) {
        navigate(ROUTE_PATHS.VEHICLES);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('[Login] Fehler:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };













  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-sm mx-auto"
      >
        {/* Logo – fliegt von oben ein */}
        <motion.div
          initial={{ opacity: 0, y: -60, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.05 }}
          className="flex flex-col items-center justify-center mb-8 gap-3"
        >
          <img
            src="/ksm_logo.png"
            alt="KSM Krug Schadenmanagement"
            className="h-36 w-auto object-contain drop-shadow-xl"
          />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-center"
          >
            <h1 className="text-xl font-bold text-foreground tracking-tight leading-none">
              {t('login.title')}
            </h1>
            <p className="text-sm text-muted-foreground font-normal mt-0.5">{t('login.subtitle')}</p>
          </motion.div>
        </motion.div>

        <Card className="border-border shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('login.welcome')}</CardTitle>
            <CardDescription>{t('login.description')}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('login.email')}</Label>
                <Input
                  id="email"
                  type="text"
                  autoComplete="username"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(false); }}
                  className={error ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t('login.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('login.passwordPlaceholder')}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(false); }}
                    className={`pr-10 ${error ? 'border-destructive' : ''}`}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-destructive text-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {t('login.error')}
                </motion.div>
              )}

              <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                {loading ? t('login.loggingIn') : t('login.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
