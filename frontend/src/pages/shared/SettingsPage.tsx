import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUserStore } from "@/store/userStore";
import { useNavigate } from "react-router-dom";

export function SettingsPage() {
  const toast = useToastStore(s => s.add);
  const queryClient = useQueryClient();
  const logout = useUserStore(s => s.logout);
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [darkTheme, setDarkTheme] = useState(() => document.documentElement.classList.contains('dark'));
  const [notifications, setNotifications] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["users", "me"],
    queryFn: async () => {
      const res = await api<any>("/users/me");
      if (res.error) throw new Error(res.error);
      return res.data!.user;
    },
  });

  useEffect(() => {
    if (data) {
      setFirstName(data.firstName || "");
      setLastName(data.lastName || "");
      setEmail(data.email || "");
    }
  }, [data]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const body: any = { firstName, lastName };
      if (currentPassword && newPassword) {
        if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
        
        // Validation: 8 chars, 1 number, 1 special char
        if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");
        if (!/[0-9]/.test(newPassword)) throw new Error("Password must contain at least one number");
        if (!/[^a-zA-Z0-9]/.test(newPassword)) throw new Error("Password must contain at least one special character");

        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      const res = await api("/users/me", { method: "PATCH", body });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ title: "Profile updated successfully", variant: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsPasswordFormOpen(false);
      setPasswordError("");
      queryClient.invalidateQueries({ queryKey: ["users", "me"] });
    },
    onError: (err: any) => {
      setPasswordError(err.message);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  });

  const handleThemeChange = (checked: boolean) => {
    setDarkTheme(checked);
    const root = document.documentElement;
    if (checked) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
    toast({ title: "Logged out", variant: "default" });
  };

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-8 w-full min-w-0 pb-12">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-muted-foreground">Preferences and security</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} disabled className="bg-muted/30 opacity-70" />
            <p className="text-xs text-muted-foreground">Email address cannot be changed</p>
          </div>
          <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your security credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPasswordFormOpen ? (
            <Button variant="outline" onClick={() => setIsPasswordFormOpen(true)}>
              Change Password
            </Button>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              {passwordError && <p className="text-sm text-red-500 font-medium">{passwordError}</p>}
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">Min 8 chars, 1 number, 1 special character</p>
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending || (!currentPassword || !newPassword || !confirmPassword)}>
                  Update Password
                </Button>
                <Button variant="ghost" onClick={() => { setIsPasswordFormOpen(false); setPasswordError(""); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Notification and display options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">Dark Mode</Label>
              <p className="text-sm text-muted-foreground">Toggle dark theme for the application</p>
            </div>
            <Checkbox checked={darkTheme} onCheckedChange={(checked) => handleThemeChange(checked === true)} />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive updates about courses and platform news</p>
            </div>
            <Checkbox checked={notifications} onCheckedChange={(checked) => setNotifications(checked === true)} />
          </div>
        </CardContent>
      </Card>

      <div className="pt-4 border-t border-border/50">
        <Button variant="destructive" className="w-full sm:w-auto" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Log out on this device
        </Button>
      </div>
    </div>
  );
}
