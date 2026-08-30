// Local mock stub replacing Supabase client
export const supabase = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
    signInWithOAuth: async () => {
      throw new Error('Supabase authentication is discontinued. Please use username/password login.');
    }
  }
};
