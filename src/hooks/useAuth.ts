import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const currentUser = await ensureProfileExists();
      setUser(currentUser);
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const currentUser = await ensureProfileExists();
          setUser(currentUser);
        } else {
          setUser(null);
        }
        setLoading(false);
      })();
    });

    const handleProfileUpdated = async () => {
      const currentUser = await ensureProfileExists();
      setUser(currentUser);
    };

    window.addEventListener('profile-updated', handleProfileUpdated);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('profile-updated', handleProfileUpdated);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: string,
    academicGroup?: string,
  ) => {
    const emailRedirectTo = import.meta.env.VITE_EMAIL_CONFIRM_REDIRECT_TO;

    // Sign up with metadata that will be used by the trigger
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirectTo || undefined,
        data: {
          full_name: fullName,
          role: role,
          academic_group: academicGroup || null,
        },
      },
    });

    // Enforce confirmation-first flow: user must confirm email before first sign in.
    if (data.session) {
      await supabase.auth.signOut();
    }

    // The trigger will handle creating users/students/teachers records
    return { data, error };
  };

  const ensureProfileExists = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) return profile;

    const fallbackProfile = {
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || user.email || '',
      role: user.user_metadata?.role || 'student',
      academic_group: user.user_metadata?.academic_group || null,
    };

    const { data: insertedProfile, error: insertError } = await supabase
      .from('users')
      .insert(fallbackProfile)
      .select('*')
      .single();

    if (insertError) {
      console.error('Unable to auto-create missing profile:', insertError);
      return null;
    }

    return insertedProfile;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const refreshProfile = async () => {
    const currentUser = await ensureProfileExists();
    setUser(currentUser);
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
};