import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCollections, createCollection } from "@/lib/assessmentStudio/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToastStore } from "@/store/toastStore";

export function CollectionsPanel() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data: collections } = useQuery({
    queryKey: ["bank-collections"],
    queryFn: async () => {
      const res = await listCollections();
      return res.data?.data || [];
    },
  });

  const handleCreate = async () => {
    if (!name.trim()) return;
    const res = await createCollection({ name: name.trim() });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    toast({ title: "Collection created", variant: "success" });
    setName("");
    queryClient.invalidateQueries({ queryKey: ["bank-collections"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Collections</h2>
        <p className="text-sm text-muted-foreground">
          Organize questions into folders, smart collections, and exam templates.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <Input
            placeholder="New collection name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={handleCreate}>Create Collection</Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(collections || []).map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-6">
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-sm text-muted-foreground">{c._count?.items ?? 0} questions</p>
              <Badge variant="outline" className="mt-2 capitalize">
                {c.kind}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
