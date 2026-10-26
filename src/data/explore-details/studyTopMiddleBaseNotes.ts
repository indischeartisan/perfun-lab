import type { ExploreArticleDetail } from '../exploreArticleDetails'

export const article: ExploreArticleDetail = {
  id: 'study-top-middle-base-notes',
  blocks: [
    { type: 'section', heading: '1. Top notes — the first hello', paragraphs: ['Top notes are the first part of a fragrance you notice. They can make the opening feel bright, green, or gently spicy.', 'In the Lab, Yuzu and Bergamot are examples of notes that can start the conversation.'] },
    { type: 'section', heading: '2. Middle notes — the character', paragraphs: ['Middle notes arrive as the first impression settles. They help give a mix its main character and keep the scent feeling present.', 'Matcha and Jasmine are two very different ways to explore a middle layer.'] },
    { type: 'section', heading: '3. Base notes — what stays close', paragraphs: ['Base notes stay with the mix for longer. They can bring a soft, warm, or grounded feeling to the scent’s final chapter.', 'Clean Musk and Sandalwood offer different places to begin exploring a base.'] },
    { type: 'takeaways', heading: 'Key takeaways', items: ['A mix has one Top, one Middle, and one Base note.', 'Each layer has its own moment to shine.', 'Your own curiosity is a good place to start.'] }
  ],
  labNote: { title: 'Little Lab Note', body: 'The three layers do not need to compete; let each one bring its own character.' }
}
