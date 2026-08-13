import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Award, ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiUrl, api, apiFormData } from "@/lib/api";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";

const schema = z.object({ firstName: z.string().min(1), lastName: z.string().min(1) });
type Form = z.infer<typeof schema>;

export function CleanProfilePage() {
  const { user, setUser, fetchUser } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const certBase = user?.role === "instructor" ? "/student" : "";
  const { data: certData } = useQuery({
    queryKey: ["profile-certificates"],
    queryFn: async () => {
      const res = await api<{ certificates: { id: string; title: string; certificateId?: string; downloadUrl: string; verifyId: string }[] }>(
        "/certificates/my"
      );
      if (res.error) return { certificates: [] };
      return res.data ?? { certificates: [] };
    },
    enabled: !!user,
  });

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
  });

  // Handle photo upload
  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast({ title: "Error", description: "Only JPG and PNG supported.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    
    try {
      // Add timeout to prevent stuck state (10 seconds max)
      const uploadPromise = new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Upload timeout - please try again"));
        }, 10000);

        try {
          // Upload file first
          const formData = new FormData();
          formData.append("file", file);
          
          const uploadRes = await apiFormData<{ url: string }>("/upload", formData);
          
          if (uploadRes.error) {
            clearTimeout(timeout);
            reject(new Error(uploadRes.error));
            return;
          }

          // Update avatar in database
          const token = localStorage.getItem("lms_token");
          const updateRes = await fetch(apiUrl("/api/users/avatar"), {
            method: "PATCH",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ avatar: uploadRes.data!.url }),
          });

          if (!updateRes.ok) {
            clearTimeout(timeout);
            reject(new Error("Failed to update avatar"));
            return;
          }

          const data = await updateRes.json();
          
          if (data.success && data.user) {
            clearTimeout(timeout);
            resolve(data.user);
          } else {
            clearTimeout(timeout);
            reject(new Error("Failed to update avatar"));
          }
        } catch (error: any) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      const updatedUser = await uploadPromise as any;
      
      // Update global state immediately for instant UI update
      setUser({
        ...updatedUser,
        avatarTimestamp: Date.now()
      });
      
      toast({ title: "Photo uploaded successfully", variant: "success" });
      
      // Reset file input
      e.target.value = '';
      
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ 
        title: "Upload failed", 
        description: error.message || "Network error occurred", 
        variant: "destructive" 
      });
    } finally {
      // ALWAYS reset loading state
      setIsUploading(false);
    }
  };

  // Handle photo removal
  const handleRemovePhoto = async () => {
    if (!user?.avatar) {
      toast({ title: "No photo to remove", variant: "destructive" });
      return;
    }

    setIsRemoving(true);
    
    try {
      // Add timeout to prevent stuck state (10 seconds max)
      const removePromise = new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Remove timeout - please try again"));
        }, 10000);

        try {
          const token = localStorage.getItem("lms_token");
          const response = await fetch(apiUrl("/api/users/avatar"), {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            clearTimeout(timeout);
            reject(new Error("Failed to remove avatar"));
            return;
          }

          const data = await response.json();
          
          if (data.success && data.user) {
            clearTimeout(timeout);
            resolve(data.user);
          } else {
            clearTimeout(timeout);
            reject(new Error("Failed to remove avatar"));
          }
        } catch (error: any) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      const updatedUser = await removePromise as any;
      
      // Update global state immediately for instant UI update
      setUser({
        ...updatedUser,
        avatarTimestamp: Date.now()
      });
      
      toast({ title: "Photo removed successfully", variant: "success" });
      
    } catch (error: any) {
      console.error("Remove error:", error);
      toast({ 
        title: "Remove failed", 
        description: error.message || "Network error occurred", 
        variant: "destructive" 
      });
    } finally {
      // ALWAYS reset loading state
      setIsRemoving(false);
    }
  };

  // Handle profile update
  const onSubmit = async (values: Form) => {
    try {
      const token = localStorage.getItem("lms_token");
      const response = await fetch(apiUrl("/api/users/me"), {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      const data = await response.json();
      
      if (data.success && data.user) {
        setUser({ ...data.user, avatarTimestamp: user?.avatarTimestamp || Date.now() });
        toast({ title: "Profile updated successfully", variant: "success" });
      } else {
        throw new Error("Failed to update profile");
      }
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast({ title: "Error", description: error.message || "Network error occurred", variant: "destructive" });
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

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
            <UnifiedAvatar user={user} size="xl" />
            <div className="flex flex-col gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{user?.firstName || ""} {user?.lastName || ""}</p>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>
              <div className="flex gap-2">
                <input 
                  type="file" 
                  accept="image/jpeg, image/png, image/jpg" 
                  className="hidden" 
                  id="avatarUpload" 
                  onChange={handleUploadPhoto} 
                  disabled={isUploading}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => document.getElementById("avatarUpload")?.click()}
                  disabled={isUploading}
                  className="transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Upload Photo"
                  )}
                </Button>
                {user.avatar && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" 
                    onClick={handleRemovePhoto}
                    disabled={isRemoving}
                  >
                    {isRemoving ? (
                      <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Remove"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input {...register("firstName")} />
              {errors.firstName && <p className="text-sm text-red-600">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input {...register("lastName")} />
              {errors.lastName && <p className="text-sm text-red-600">{errors.lastName.message}</p>}
            </div>
            <Button type="submit">Save changes</Button>
          </form>
        </CardContent>
      </Card>

      {(certData?.certificates?.length ?? 0) > 0 && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Certificates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {certData!.certificates.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.title}</p>
                  {c.certificateId && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{c.certificateId}</p>
                  )}
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                    <Link to={`/verify/certificate/${c.verifyId}`} target="_blank">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to={`${certBase}/certificates`}>View all certificates</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
