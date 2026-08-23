const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function addPost() {
  let user = await prisma.user.findFirst({where: {email: 'test@test.com'}});
  if (!user) {
    user = await prisma.user.findFirst();
  }
  if (user) {
    await prisma.post.create({
      data: {
        content: 'Just checking out the new Sports Hub! Bracket challenge looks amazing.', 
        user: { connect: { id: user.id } }
      }
    });
    console.log('Post created for user:', user.email);
  } else {
    console.log('No user found');
  }
}
addPost().finally(()=>prisma.$disconnect());
