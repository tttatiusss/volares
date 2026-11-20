import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'airline',
  title: 'Companhia aérea',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Nome',
      type: 'string',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'code',
      title: 'Código',
      type: 'string',
      description: 'Código IATA ou código operacional da companhia.',
      validation: (rule) =>
        rule
          .required()
          .min(2)
          .max(3)
          .uppercase()
          .regex(/^[A-Z0-9]+$/, {
            name: 'código alfanumérico',
            invert: false,
          }),
    }),
    defineField({
      name: 'logo',
      title: 'Logotipo',
      type: 'image',
      options: {hotspot: true},
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'code',
      media: 'logo',
    },
  },
})
