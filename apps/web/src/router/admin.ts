import type { RouteRecordRaw } from 'vue-router'

// 管理员路由配置
const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: {
      requiresAuth: true,
      title: 'Admin',
    },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/admin/Dashboard.vue'),
        meta: {
          title: 'Dashboard',
        },
      },
      {
        path: 'activities',
        name: 'Activities',
        redirect: '/admin/activities/list',
        children: [
          {
            path: 'list',
            name: 'Activity List',
            component: () => import('../views/admin/activityList.vue'),
            meta: {
              title: 'List',
            },
          },
          {
            path: 'edit/:id',
            name: 'Edit Activity',
            component: () => import('../views/admin/activityEdit.vue'),
            meta: {
              title: 'Edit',
            },
          },
          {
            path: 'detail/:id',
            name: 'Activity Detail',
            component: () => import('../views/admin/activityDetail.vue'),
            meta: {
              title: 'Detail',
            },
          },
          {
            path: 'create',
            name: 'Create',
            component: () => import('../views/admin/activityEdit.vue'),
            meta: {
              title: 'Create Activity',
            },
          },
          {
            path: 'data/:id',
            name: 'Activity Data',
            component: () => import('../views/admin/activityData.vue'),
            meta: {
              title: 'Activity Data',
            },
          },
        ],
      },
      {
        path: 'users',
        name: 'Users',
        redirect: '/admin/users/list',
        children: [
          {
            path: 'list',
            name: 'User List',
            component: () => import('../views/admin/userList.vue'),
            meta: {
              title: 'List',
            },
          },
          {
            path: 'detail/:id',
            name: 'User Detail',
            component: () => import('../views/admin/userDetail.vue'),
            meta: {
              title: 'Detail',
            },
          },
          {
            path: 'add',
            name: 'Add',
            component: () => import('../views/admin/userDetail.vue'),
            meta: {
              title: 'Add User',
            },
          },
        ],
      },
      {
        path: 'super-settings',
        name: 'Super Settings',
        component: () => import('../views/admin/superSettings.vue'),
        meta: {
          title: 'Super Settings',
        },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/admin/settings.vue'),
        meta: {
          title: 'Settings',
        },
      },
    ],
  },
]

export default adminRoutes
