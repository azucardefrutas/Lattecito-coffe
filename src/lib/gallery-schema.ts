import { z } from 'zod';

export const galleryCategories = [
  'local',
  'bebidas',
  'alimentos',
  'equipo',
  'eventos',
  'otro',
] as const;

export type GalleryCategory = (typeof galleryCategories)[number];

export const galleryCategoryLabels: Record<GalleryCategory, string> = {
  local: 'Nuestro espacio',
  bebidas: 'Bebidas',
  alimentos: 'Alimentos',
  equipo: 'Equipo',
  eventos: 'Eventos',
  otro: 'Otros momentos',
};

export type GalleryItem = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  altText: string;
  category: GalleryCategory;
  width: number;
  height: number;
  sortOrder: number;
  published: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const galleryMetadataSchema = z.object({
  title: z.string().trim().min(2, 'Escribe un título de al menos 2 caracteres.').max(120),
  description: z.string().trim().max(500, 'La descripción puede tener hasta 500 caracteres.'),
  altText: z.string().trim().min(3, 'Describe brevemente lo que aparece en la foto.').max(180),
  category: z.enum(galleryCategories),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
  published: z.boolean().default(true),
});

export const galleryUpdateSchema = galleryMetadataSchema
  .omit({ width: true, height: true })
  .extend({
    id: z.uuid(),
    sortOrder: z.number().int().min(0).max(1000000),
  });

export const galleryDeleteSchema = z.object({ id: z.uuid() });

export const galleryReorderSchema = z.object({
  ids: z.array(z.uuid()).max(500),
});
