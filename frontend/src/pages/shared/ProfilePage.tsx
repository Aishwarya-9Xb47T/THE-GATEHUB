import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, apiFormData } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";

const schema = z.object({ firstName: z.string().min(1), lastName: z.string().min(1) });
type Form = z.infer<typeof schema>;

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const toast = useToastStore((s) => s.add);

  // Function to force refetch latest user data from backend
  const refetchUser = async () => {
    try {
      console.log("REFETCHING USER DATA FROM BACKEND");
      const res = await api<{ user: any }>("/users/me");
      if (res.data?.user) {
        console.log("REFETCHED USER DATA:", res.data.user);
        setUser({ ...res.data.user, avatarTimestamp: Date.now() });
      }
    } catch (error: any) {
      console.error("Error refetching user data:", error);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    console.log("Profile photo upload:", { name: file.name, type: file.type, size: file.size });
    
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast({ title: "Error", description: "Only JPG and PNG supported.", variant: "destructive" });
      return;
    }
    
    const fd = new FormData();
    fd.append("file", file);
    
    try {
      console.log("Uploading profile photo...");
      const upRes = await apiFormData<{ url: string }>("/upload", fd);
      
      if (upRes.error) {
        console.error("Upload failed:", upRes.error);
        toast({ title: "Upload failed", description: upRes.error, variant: "destructive" });
        return;
      }
      
      console.log("Upload successful:", upRes.data?.url);
      
      // Update global state immediately
      setUser({ ...user!, avatar: upRes.data!.url });
      
      const patchRes = await api<{ user: any }>("/users/me", { 
        method: "PATCH", 
        body: { avatar: upRes.data!.url } 
      });
      
      if (patchRes.error) {
        console.error("Profile update failed:", patchRes.error);
        // Revert on error
        setUser({ ...user!, avatar: user?.avatar });
        toast({ title: "Error updating profile", description: patchRes.error, variant: "destructive" });
      } else {
        console.log("Profile updated successfully:", patchRes.data?.user);
        // Force refetch to ensure we have the latest data from database
        await refetchUser();
        toast({ title: "Profile updated successfully", variant: "success" });
        
        // Reset file input
        e.target.value = '';
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload error", description: error.message || "Network error occurred", variant: "destructive" });
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.avatar) {
      toast({ title: "No photo to remove", variant: "destructive" });
      return;
    }

    try {
      console.log("Removing profile photo...");
      console.log("Current state before removal:", { avatar: user?.avatar });
      
      // Store original avatar for potential revert
      const originalAvatar = user.avatar;
      
      // Update global state immediately - this will hide the image instantly
      setUser({ ...user, avatar: null, avatarTimestamp: Date.now() });
      
      const patchRes = await api<{ user: any }>("/users/me", { 
        method: "PATCH", 
        body: { avatar: null } 
      });
      
      if (patchRes.error) {
        console.error("Photo removal failed:", patchRes.error);
        // Revert on error
        setUser({ ...user, avatar: originalAvatar, avatarTimestamp: Date.now() });
        toast({ title: "Error removing photo", description: patchRes.error, variant: "destructive" });
      } else {
        console.log("Photo removed successfully:", patchRes.data?.user);
        // Force refetch to ensure we have the latest data from database
        await refetchUser();
        toast({ title: "Photo removed", variant: "success" });
      }
    } catch (error: any) {
      console.error("Photo removal error:", error);
      // Revert on error
      setUser({ ...user, avatar: user?.avatar, avatarTimestamp: Date.now() });
      toast({ title: "Removal error", description: error.message || "Network error occurred", variant: "destructive" });
    }
  };

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
  });

  const onSubmit = async (values: Form) => {
    const res = await api<{ user: any }>("/users/me", { method: "PATCH", body: values });
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else {
      setUser({ ...user!, ...res.data!.user });
      toast({ title: "Profile updated successfully", variant: "success" });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Profile</h1>
        <p className="mt-1 text-muted-foreground">Manage your account</p>
      </div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Personal info</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <ProfileAvatar 
                key={`avatar-${user?.avatar ?? 'none'}`}
                src={user?.avatar}
                firstName={user?.firstName}
                lastName={user?.lastName}
                size="xl"
                avatarTimestamp={user?.avatarTimestamp}
              />
              <div className="flex flex-col gap-2">
                <div>
                  <p className="font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
                  <p className="text-sm text-muted-foreground">{user?.role}</p>
                </div>
                <div className="flex gap-2">
                  <input type="file" accept="image/jpeg, image/png, image/jpg" className="hidden" id="avatarUpload" onChange={handleUploadPhoto} />
                  <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("avatarUpload")?.click()}>
                    Upload Photo
                  </Button>
                  {user?.avatar && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleRemovePhoto}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>First name</Label>
                <Input defaultValue={user?.firstName} {...register("firstName")} />
                {errors.firstName && <p className="text-sm text-red-600">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Last name</Label>
                <Input defaultValue={user?.lastName} {...register("lastName")} />
                {errors.lastName && <p className="text-sm text-red-600">{errors.lastName.message}</p>}
              </div>
              <Button type="submit">Save changes</Button>
            </form>
        </CardContent>
      </Card>
    </div>
  );
}
