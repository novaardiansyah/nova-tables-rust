import { useCallback, useRef, useState } from 'react'
import { api, DatabaseInfo } from '../api'

export interface DatabaseUserDetail {
  name: string
  type: string
  defaultSchema?: string | null
  canManage: boolean
  reason?: string | null
  loginName?: string | null
  roles: string[]
}

export interface ServerLoginItem {
  name: string
  type: string
  isDisabled?: boolean
  isLocked?: boolean
}

export interface DatabaseUserStateData {
  status: 'idle' | 'loading' | 'ready' | 'error'
  users: DatabaseUserDetail[]
  roles: string[]
  logins: ServerLoginItem[]
  error: string | null
}

const EMPTY_DATABASE_USERS: DatabaseUserStateData = {
  status: 'idle',
  users: [],
  roles: [],
  logins: [],
  error: null,
}

export interface UseDatabaseUsersProps {
  activeSession: () => {
    connectionId: string
    activeDatabase?: string | null
    databases?: DatabaseInfo[]
  } | null
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
}

export function useDatabaseUsers({ activeSession, showBanner }: UseDatabaseUsersProps) {
  const [databaseUsersOpen, setDatabaseUsersOpen] = useState(false)
  const [databaseUsers, setDatabaseUsers] = useState<DatabaseUserStateData>(EMPTY_DATABASE_USERS)
  const [databaseUsersBusy, setDatabaseUsersBusy] = useState(false)
  const databaseUsersRequestRef = useRef(0)

  const loadDatabaseUsers = useCallback(async (connectionId: string, database: string) => {
    const requestId = databaseUsersRequestRef.current + 1
    databaseUsersRequestRef.current = requestId
    setDatabaseUsers((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const data = await api.listDatabaseUsers(connectionId, database) as any
      if (databaseUsersRequestRef.current !== requestId) return
      setDatabaseUsers({
        status: 'ready',
        users: data.users || [],
        roles: data.roles || [],
        logins: data.logins || [],
        error: null,
      })
    } catch (error: any) {
      if (databaseUsersRequestRef.current !== requestId) return
      setDatabaseUsers((current) => ({ ...current, status: 'error', error: error.message }))
    }
  }, [])

  const handleOpenDatabaseUsers = useCallback(() => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    const info = (current.databases ?? []).find(
      (database) => database.name === current.activeDatabase,
    )
    if (!info?.isOnline || info.isSystem) return
    setDatabaseUsersOpen(true)
    loadDatabaseUsers(current.connectionId, current.activeDatabase)
  }, [activeSession, loadDatabaseUsers])

  const handleCloseDatabaseUsers = useCallback(() => {
    if (databaseUsersBusy) return
    databaseUsersRequestRef.current += 1
    setDatabaseUsersOpen(false)
    setDatabaseUsers(EMPTY_DATABASE_USERS)
  }, [databaseUsersBusy])

  const handleRefreshDatabaseUsers = useCallback(() => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    loadDatabaseUsers(current.connectionId, current.activeDatabase)
  }, [activeSession, loadDatabaseUsers])

  const handleCreateDatabaseUser = useCallback(
    async (login: string, roles: string[]) => {
      const current = activeSession()
      if (!current?.activeDatabase) return false
      setDatabaseUsersBusy(true)
      setDatabaseUsers((value) => ({ ...value, error: null }))
      try {
        await api.createDatabaseUser({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          name: login,
          roles,
        })
        await loadDatabaseUsers(current.connectionId, current.activeDatabase)
        showBanner('success', `Created database user “${login}”.`)
        return true
      } catch (error: any) {
        setDatabaseUsers((value) => ({ ...value, error: error.message }))
        return false
      } finally {
        setDatabaseUsersBusy(false)
      }
    },
    [activeSession, loadDatabaseUsers, showBanner],
  )

  const handleUpdateDatabaseUserRoles = useCallback(
    async (user: { name: string }, roles: string[]) => {
      const current = activeSession()
      if (!current?.activeDatabase) return false
      setDatabaseUsersBusy(true)
      setDatabaseUsers((value) => ({ ...value, error: null }))
      try {
        await api.updateDatabaseUserRoles({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          name: user.name,
          roles,
        })
        await loadDatabaseUsers(current.connectionId, current.activeDatabase)
        showBanner('success', `Updated roles for “${user.name}”.`)
        return true
      } catch (error: any) {
        setDatabaseUsers((value) => ({ ...value, error: error.message }))
        return false
      } finally {
        setDatabaseUsersBusy(false)
      }
    },
    [activeSession, loadDatabaseUsers, showBanner],
  )

  const handleDropDatabaseUser = useCallback(
    async (user: { name: string }) => {
      const current = activeSession()
      if (!current?.activeDatabase) return false
      setDatabaseUsersBusy(true)
      setDatabaseUsers((value) => ({ ...value, error: null }))
      try {
        await api.dropDatabaseUser({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          name: user.name,
        })
        await loadDatabaseUsers(current.connectionId, current.activeDatabase)
        showBanner('success', `Dropped database user “${user.name}”.`)
        return true
      } catch (error: any) {
        setDatabaseUsers((value) => ({ ...value, error: error.message }))
        return false
      } finally {
        setDatabaseUsersBusy(false)
      }
    },
    [activeSession, loadDatabaseUsers, showBanner],
  )

  return {
    databaseUsersOpen,
    databaseUsers,
    databaseUsersBusy,
    handleOpenDatabaseUsers,
    handleCloseDatabaseUsers,
    handleRefreshDatabaseUsers,
    handleCreateDatabaseUser,
    handleUpdateDatabaseUserRoles,
    handleDropDatabaseUser,
  }
}
